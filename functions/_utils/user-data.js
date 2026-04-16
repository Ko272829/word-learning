export const nowIso = () => new Date().toISOString();

export const normalizeBookIds = (payload) => {
  const list = Array.isArray(payload?.bookIds)
    ? payload.bookIds
    : payload?.bookId
      ? [payload.bookId]
      : [];
  return Array.from(
    new Set(
      list
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    )
  );
};

export const normalizeFavorites = (payload) => {
  const list = Array.isArray(payload?.favorites)
    ? payload.favorites
    : payload?.itemType && payload?.itemId
      ? [{ itemType: payload.itemType, itemId: payload.itemId }]
      : [];

  return list
    .map((item) => ({
      itemType: String(item?.itemType || "").trim(),
      itemId: String(item?.itemId || "").trim()
    }))
    .filter((item) => item.itemType && item.itemId);
};

export const normalizeSettings = (payload) => {
  const settings = payload?.settings && typeof payload.settings === "object"
    ? payload.settings
    : payload && typeof payload === "object"
      ? payload
      : {};

  return Object.entries(settings).reduce((result, [key, value]) => {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) return result;
    result[cleanKey] = value == null ? "" : JSON.stringify(value);
    return result;
  }, {});
};

export const normalizeProgressRows = (payload) => {
  const rows = Array.isArray(payload?.items)
    ? payload.items
    : payload?.bookId && payload?.wordId
      ? [payload]
      : [];

  return rows
    .map((item) => {
      const bookId = String(item?.bookId || "").trim();
      const wordId = String(item?.wordId || "").trim();
      if (!bookId || !wordId) return null;

      const progressData = item?.progress && typeof item.progress === "object"
        ? item.progress
        : item?.data && typeof item.data === "object"
          ? item.data
          : {};

      return {
        id: String(item?.id || `${item?.userId || "user"}:${bookId}:${wordId}`).trim(),
        bookId,
        wordId,
        status: String(item?.status || progressData.status || "").trim(),
        lastReviewedAt: item?.lastReviewedAt || item?.last_reviewed_at || progressData.lastReviewedAt || null,
        nextReviewAt: item?.nextReviewAt || item?.next_review_at || progressData.nextReviewAt || progressData.nextReview || null,
        data: progressData
      };
    })
    .filter(Boolean);
};

export const parseSettingValue = (value) => {
  if (value == null || value === "") return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
