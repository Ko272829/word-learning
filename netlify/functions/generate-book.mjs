const buildPrompt = (topic) => `
你是英语学习产品的专业词书编辑。请围绕主题“${topic}”生成一本高质量中文学习者词书。

输出要求：
1. 只输出一个 JSON 对象，不要 Markdown，不要额外解释。
2. JSON 结构必须为：
{
  "bookName": "词书名称",
  "words": [
    {
      "word": "英文单词或短语",
      "phonetic": "/音标/",
      "pos": "词性缩写，如 n. / v. / adj.",
      "meaning": "简洁中文释义",
      "exampleEn": "自然简短的英文例句",
      "exampleZh": "对应中文翻译"
    }
  ]
}
3. 返回 18 到 24 个词条。
4. 单词要和主题高度相关，适合记忆，不要重复。
5. 所有字段都必须填写；如果是短语，word 字段直接写短语。
6. 例句要自然、口语化、实用。
`.trim();

const sanitizeWord = (item, index, bookId) => ({
  id: `${bookId}_${index}`,
  word: String(item.word || '').trim(),
  phonetic: String(item.phonetic || '').trim(),
  pos: String(item.pos || '').trim(),
  meaning: String(item.meaning || '').trim(),
  exampleEn: String(item.exampleEn || '').trim(),
  exampleZh: String(item.exampleZh || '').trim()
});

export default async (req) => {
  if (req.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: '缺少 DEEPSEEK_API_KEY 环境变量' })
    };
  }

  try {
    const { topic } = JSON.parse(req.body || '{}');
    const cleanTopic = String(topic || '').trim();
    if (!cleanTopic) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '请输入词书主题' })
      };
    }

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        temperature: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: '你必须严格输出合法 JSON。'
          },
          {
            role: 'user',
            content: buildPrompt(cleanTopic)
          }
        ]
      })
    });

    if (!upstream.ok) {
      const errorText = await upstream.text();
      return {
        statusCode: upstream.status,
        body: JSON.stringify({ error: `DeepSeek 请求失败: ${errorText}` })
      };
    }

    const payload = await upstream.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'DeepSeek 未返回词书内容' })
      };
    }

    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed.words) || parsed.words.length === 0) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: '返回的词书格式无效' })
      };
    }

    const bookId = `ai_${Date.now()}`;
    const words = parsed.words
      .map((item, index) => sanitizeWord(item, index, bookId))
      .filter((item) => item.word && item.meaning);

    if (words.length === 0) {
      return {
        statusCode: 502,
        body: JSON.stringify({ error: 'AI 未生成有效词条' })
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        book: {
          id: bookId,
          name: String(parsed.bookName || `${cleanTopic}词书`).trim(),
          words
        }
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || '服务器处理失败' })
    };
  }
};
