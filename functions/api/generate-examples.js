const buildPrompt = (bookName, words) => `
你是英语学习产品的例句编辑。请为下面这些词条补充适合中文学习者记忆的例句。

输出要求：
1. 只输出一个 JSON 对象，不要 Markdown，不要额外解释。
2. JSON 结构必须为：
{
  "examples": [
    {
      "word": "英文单词或短语",
      "meaning": "中文释义",
      "exampleEn": "简短自然的英文例句",
      "exampleZh": "对应中文翻译"
    }
  ]
}
3. 每个词条都必须返回一条例句。
4. 例句尽量简短、自然、容易记忆，优先使用常见场景。
5. 例句要和词义匹配，不要返回复杂长句。
6. 必须覆盖输入中的全部词条，顺序尽量保持一致。

词书：${bookName}
词条：
${words.map((item, index) => `${index + 1}. ${item.word} | ${item.pos || '-'} | ${item.meaning}`).join('\n')}
`.trim();

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });

const extractJsonObject = (text) => {
  if (!text) throw new Error("DeepSeek 返回了空内容");

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

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error("无法从 DeepSeek 响应中提取 JSON");
};

const sanitizeExample = (item) => ({
  word: String(item.word || "").trim(),
  meaning: String(item.meaning || "").trim(),
  exampleEn: String(item.exampleEn || "").trim(),
  exampleZh: String(item.exampleZh || "").trim()
});

export async function onRequestPost(context) {
  const apiKey = context.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json({ error: "缺少 DEEPSEEK_API_KEY 环境变量" }, 500);
  }

  try {
    const { bookName, words } = await context.request.json();
    const cleanBookName = String(bookName || "").trim() || "词书";
    if (!Array.isArray(words) || words.length === 0) {
      return json({ error: "请提供需要补例句的词条" }, 400);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 18000);

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.4,
        max_tokens: 1400,
        messages: [
          {
            role: "system",
            content: "你是英语学习例句生成助手。必须返回合法 JSON，不要输出 Markdown 代码块之外的解释。"
          },
          {
            role: "user",
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
      return json({ error: "DeepSeek 未返回例句内容" }, 502);
    }

    const parsed = extractJsonObject(content);
    if (!Array.isArray(parsed.examples) || parsed.examples.length === 0) {
      return json({ error: "返回的例句格式无效" }, 502);
    }

    const examples = parsed.examples
      .map(sanitizeExample)
      .filter((item) => item.word && item.meaning && item.exampleEn && item.exampleZh);

    if (examples.length === 0) {
      return json({ error: "AI 未生成有效例句" }, 502);
    }

    return json({ examples });
  } catch (error) {
    if (error.name === "AbortError") {
      return json({ error: "补例句请求超时，请稍后重试。" }, 504);
    }

    return json({ error: error.message || "服务端处理失败" }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Method Not Allowed" }, 405);
}
