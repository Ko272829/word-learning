import https from 'node:https';

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
3. 返回 10 到 12 个词条。
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

const extractJsonObject = (text) => {
  if (!text) throw new Error('DeepSeek 返回了空内容');

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const fencedMatch = trimmed.match(/```json\s*([\s\S]*?)\s*```/i) || trimmed.match(/```\s*([\s\S]*?)\s*```/);
  if (fencedMatch) {
    return JSON.parse(fencedMatch[1].trim());
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  throw new Error('无法从 DeepSeek 响应中提取 JSON');
};

const requestDeepSeek = (apiKey, topic) =>
  new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'deepseek-chat',
      temperature: 0.7,
      max_tokens: 1800,
      messages: [
        {
          role: 'system',
          content: '你是词书生成助手。必须返回一个合法 JSON 对象，不要输出 Markdown 代码块之外的解释。'
        },
        {
          role: 'user',
          content: buildPrompt(topic)
        }
      ]
    });

    const req = https.request(
      'https://api.deepseek.com/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Authorization: `Bearer ${apiKey}`
        },
        timeout: 18000
      },
      (res) => {
        let body = '';

        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 500,
            body
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('DeepSeek 请求超时，请稍后重试或把主题描述写得更短一些。'));
    });
    req.on('error', (error) => reject(error));
    req.write(payload);
    req.end();
  });

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: '缺少 DEEPSEEK_API_KEY 环境变量' })
    };
  }

  try {
    const { topic } = JSON.parse(event.body || '{}');
    const cleanTopic = String(topic || '').trim();
    if (!cleanTopic) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: '请输入词书主题' })
      };
    }

    const upstream = await requestDeepSeek(apiKey, cleanTopic);

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return {
        statusCode: upstream.statusCode,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: `DeepSeek 请求失败: ${upstream.body}` })
      };
    }

    const payload = JSON.parse(upstream.body);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return {
        statusCode: 502,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'DeepSeek 未返回词书内容' })
      };
    }

    const parsed = extractJsonObject(content);
    if (!Array.isArray(parsed.words) || parsed.words.length === 0) {
      return {
        statusCode: 502,
        headers: {
          'Content-Type': 'application/json'
        },
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
        headers: {
          'Content-Type': 'application/json'
        },
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
    if (String(error.message || '').includes('超时')) {
      return {
        statusCode: 504,
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'DeepSeek 请求超时，请稍后重试或把主题描述写得更短一些。' })
      };
    }

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message || '服务器处理失败' })
    };
  }
}
