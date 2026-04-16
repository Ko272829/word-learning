import { badRequest, json, parseJsonBody, serverError } from "../../../_utils/http.js";
import { requireUser } from "../../../_utils/auth.js";
import { normalizeProgressRows, nowIso } from "../../../_utils/user-data.js";

const serializeProgressRow = (row) => {
  let data = {};
  try {
    data = row.data ? JSON.parse(row.data) : {};
  } catch {
    data = {};
  }

  return {
    id: row.id,
    bookId: row.book_id,
    wordId: row.word_id,
    status: row.status || data.status || "",
    lastReviewedAt: row.last_reviewed_at,
    nextReviewAt: row.next_review_at,
    progress: data
  };
};

export async function onRequestGet(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  try {
    const results = await context.env.DB
      .prepare(`
        SELECT id, book_id, word_id, status, last_reviewed_at, next_review_at, data
        FROM user_progress
        WHERE user_id = ?
        ORDER BY updated_at DESC
      `)
      .bind(user.id)
      .all();

    const items = (results.results || []).map(serializeProgressRow);
    const progressMap = items.reduce((map, item) => {
      map[item.wordId] = {
        ...(item.progress || {}),
        status: item.status,
        lastReviewedAt: item.lastReviewedAt,
        nextReviewAt: item.nextReviewAt,
        nextReview: item.progress?.nextReview ?? (item.nextReviewAt ? Date.parse(item.nextReviewAt) : null)
      };
      return map;
    }, {});

    return json({ items, progressMap });
  } catch (error) {
    return serverError(error?.message || "Failed to fetch progress");
  }
}

export async function onRequestPost(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  const body = await parseJsonBody(context.request);
  if (!body) {
    return badRequest("Request body must be valid JSON");
  }

  const items = normalizeProgressRows(body);
  if (items.length === 0) {
    return badRequest("Progress items are required");
  }

  try {
    const now = nowIso();
    const statements = items.map((item) => {
      const progressData = {
        ...item.data,
        status: item.status,
        lastReviewedAt: item.lastReviewedAt,
        nextReviewAt: item.nextReviewAt
      };

      return context.env.DB
        .prepare(`
          INSERT INTO user_progress (
            id, user_id, book_id, word_id, status, last_reviewed_at, next_review_at, data, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, book_id, word_id) DO UPDATE SET
            status = excluded.status,
            last_reviewed_at = excluded.last_reviewed_at,
            next_review_at = excluded.next_review_at,
            data = excluded.data,
            updated_at = excluded.updated_at
        `)
        .bind(
          item.id || crypto.randomUUID(),
          user.id,
          item.bookId,
          item.wordId,
          item.status || null,
          item.lastReviewedAt || null,
          item.nextReviewAt || null,
          JSON.stringify(progressData),
          now,
          now
        );
    });

    await context.env.DB.batch(statements);
    return json({ ok: true, count: items.length });
  } catch (error) {
    return serverError(error?.message || "Failed to save progress");
  }
}
