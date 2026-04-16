const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8"
    }
  });

const buildPrompt = (topic, variationHint, candidates) => `
你是英语学习产品的选词助手。
你的任务不是发明新单词，而是只能从我提供的候选词库中挑选最适合主题“${topic}”的一组单词。
本次随机采样标签：${variationHint}

要求：
1. 只能从候选列表里选，不能新增、改写或猜测不存在的单词。
2. 优先选择和主题最相关、适合学生记忆、彼此不重复的词。
3. 返回 6 到 8 个候选项 id。
4. 你可以调整顺序，但不要输出候选列表里没有的 id。
5. 不要输出 markdown，不要输出解释。

输出 JSON 结构必须是：
{
  "bookName": "词书名称",
  "candidateIds": ["id1", "id2", "id3"]
}

候选列表：
${candidates.map((item) => `${item.candidateId} | ${item.word} | ${item.pos || "-"} | ${item.meaning}`).join("\n")}
`.trim();

const extractJsonObject = (text) => {
  if (!text) throw new Error("DeepSeek returned empty content");

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

  throw new Error("Unable to extract JSON from DeepSeek response");
};

const sanitizeCandidate = (item) => ({
  candidateId: String(item?.candidateId || "").trim(),
  word: String(item?.word || "").trim(),
  pos: String(item?.pos || "").trim(),
  meaning: String(item?.meaning || "").trim(),
  phonetic: String(item?.phonetic || "").trim(),
  exampleEn: String(item?.exampleEn || "").trim(),
  exampleZh: String(item?.exampleZh || "").trim()
});

const sanitizeWord = (item, index, bookId) => ({
  id: `${bookId}_${index}`,
  word: item.word,
  phonetic: item.phonetic || "",
  pos: item.pos || "",
  meaning: item.meaning || "",
  exampleEn: item.exampleEn || "",
  exampleZh: item.exampleZh || ""
});

export async function onRequestPost(context) {
  const apiKey = context.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json({ error: "Missing DEEPSEEK_API_KEY" }, 500);
  }

  try {
    const { topic, variationHint, candidates } = await context.request.json();
    const cleanTopic = String(topic || "").trim();
    const cleanVariationHint = String(variationHint || Date.now()).trim();
    const cleanCandidates = Array.isArray(candidates)
      ? candidates.map(sanitizeCandidate).filter((item) => item.candidateId && item.word && item.meaning)
      : [];

    if (!cleanTopic) {
      return json({ error: "请输入词书主题" }, 400);
    }

    if (cleanCandidates.length < 6) {
      return json({ error: "候选词数量不足，无法生成主题词书" }, 400);
    }

    const candidateMap = new Map(cleanCandidates.map((item) => [item.candidateId, item]));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const upstream = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0.4,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are a vocabulary selector. Return valid JSON only."
          },
          {
            role: "user",
            content: buildPrompt(cleanTopic, cleanVariationHint, cleanCandidates)
          }
        ]
      }),
      signal: controller.signal
    }).finally(() => clearTimeout(timeoutId));

    const upstreamText = await upstream.text();
    if (!upstream.ok) {
      return json({ error: `DeepSeek request failed: ${upstreamText}` }, upstream.status);
    }

    const payload = JSON.parse(upstreamText);
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      return json({ error: "DeepSeek did not return candidate selection" }, 502);
    }

    const parsed = extractJsonObject(content);
    const candidateIds = Array.isArray(parsed?.candidateIds)
      ? parsed.candidateIds.map((item) => String(item).trim()).filter(Boolean)
      : [];

    const words = Array.from(new Set(candidateIds))
      .map((candidateId, index) => {
        const item = candidateMap.get(candidateId);
        return item ? sanitizeWord(item, index, `ai_${Date.now()}`) : null;
      })
      .filter(Boolean);

    if (words.length === 0) {
      return json({ error: "DeepSeek 没有从候选词库里选出有效单词" }, 502);
    }

    const bookId = `ai_${Date.now()}`;
    return json({
      book: {
        id: bookId,
        name: String(parsed?.bookName || `${cleanTopic}词书`).trim(),
        words: words.map((item, index) => ({ ...item, id: `${bookId}_${index}` }))
      }
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      return json({ error: "DeepSeek 请求超时，请稍后重试。" }, 504);
    }

    return json({ error: error?.message || "服务器处理失败" }, 500);
  }
}

export async function onRequestGet() {
  return json({ error: "Method Not Allowed" }, 405);
}
