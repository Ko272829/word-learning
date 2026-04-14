const buildPrompt = (bookName, words) => `
你是一名英语教学内容生成助手。你的任务是为背单词产品生成“复习阶段”使用的英文例句。

规则：
1. 例句用途是帮助用户在复习时快速回忆单词，不是词典释义，不是知识拓展。
2. 例句必须严格围绕用户给定的当前词义生成，不能偏义，不能扩展到其他义项。
3. 句子长度控制在 8 到 14 个英文单词之间。
4. 句式尽量简单、自然、常见，优先使用日常生活、校园、学习、工作初级场景。
5. 用词难度不能明显高于目标单词本身，避免冷僻词、术语、抽象表达、文学化表达。
6. 不要使用复杂从句、罕见搭配、双关、俚语。
7. 中文翻译要自然、准确、简洁，与英文句子语义一一对应。
8. 如果单词有多个词性或多个义项，只能围绕当前传入的 meaning 生成。
9. 必须保证目标单词 word 出现在 exampleEn 中，且形式自然。
10. 不需要输出音标、词性解释、额外说明、备注。
11. 必须覆盖输入中的全部词条，尽量保持顺序一致。

输出要求：
1. 只输出一个 JSON 对象。
2. 不要输出 Markdown，不要输出代码块，不要输出任何解释文字。
3. JSON 结构固定为：
{
  "examples": [
    {
      "word": "access",
      "meaning": "接近；入口",
      "exampleEn": "Students can access the library after class.",
      "exampleZh": "学生下课后可以进入图书馆。"
    }
  ]
}

当前词书：${bookName}
待生成词条：
${words.map((item, index) => `${index + 1}. word=${item.word}; pos=${item.pos || '-'}; meaning=${item.meaning}`).join('\n')}
`.trim();

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    }
  });

const extractJsonObject = (text) => {
  if (!text) throw new Error('DeepSeek returned empty content');

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const fencedMatch =
    trimmed.match(/```json\s*([\s\S]*?)\s*```/i) ||
    trimmed.match(/```\s*([\s\S]*?)\s*```/);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error('Unable to extract JSON from DeepSeek response');
};

const sanitizeExample = (item) => ({
  word: String(item.word || '').trim(),
  meaning: String(item.meaning || '').trim(),
  exampleEn: String(item.exampleEn || item.example_en || '').trim(),
  exampleZh: String(item.exampleZh || item.example_zh || '').trim()
});

export async function onRequestPost(context) {
  const apiKey = context.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json({ error: '缺少 DEEPSEEK_API_KEY 环境变量' }, 500);
  }

  try {
    const { bookName, words } = await context.request.json();
    const cleanBookName = String(bookName || '').trim() || '词书';
    if (!Array.isArray(words) || words.length === 0) {
      return json({ error: '请提供需要补例句的词条' }, 400);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.3,
        max_tokens: 1400,
        messages: [
          {
            role: 'system',
            content: '你是英语教学内容生成助手。你必须严格返回合法 JSON。不要输出 Markdown，不要输出代码块，不要输出任何 JSON 之外的解释。'
          },
          {
            role: 'user',
            content: buildPrompt(cleanBookName, words)
          }
        ]
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    const upstreamText = await upstream.text();
    if (!upstream.ok) {
      return json({ error: `DeepSeek 请求失败: ${upstreamText}` }, upstream.status);
    }

    const payload = JSON.parse(upstreamText);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return json({ error: 'DeepSeek 未返回例句内容' }, 502);
    }

    const parsed = extractJsonObject(content);
    if (!Array.isArray(parsed.examples) || parsed.examples.length === 0) {
      return json({ error: '返回的例句格式无效' }, 502);
    }

    const examples = parsed.examples
      .map(sanitizeExample)
      .filter((item) => item.word && item.meaning && item.exampleEn && item.exampleZh);

    if (examples.length === 0) {
      return json({ error: 'AI 未生成有效例句' }, 502);
    }

    return json({ examples });
  } catch (error) {
    if (error.name === 'AbortError') {
      return json({ error: '补例句请求超时，请稍后重试。' }, 504);
    }

    return json({ error: error.message || '服务端处理失败' }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: 'Method Not Allowed' }, 405);
}
