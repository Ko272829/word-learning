import { badRequest, json, parseJsonBody, serverError } from "../../../_utils/http.js";
import { requireUser } from "../../../_utils/auth.js";
import { normalizeBookIds } from "../../../_utils/user-data.js";

export async function onRequestGet(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  try {
    const results = await context.env.DB
      .prepare("SELECT id, book_id, created_at FROM user_books WHERE user_id = ? ORDER BY created_at ASC")
      .bind(user.id)
      .all();

    const items = results.results || [];
    return json({
      items: items.map((item) => ({
        id: item.id,
        bookId: item.book_id,
        createdAt: item.created_at
      })),
      bookIds: items.map((item) => item.book_id)
    });
  } catch (error) {
    return serverError(error?.message || "Failed to fetch user books");
  }
}

export async function onRequestPost(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  const body = await parseJsonBody(context.request);
  if (!body) {
    return badRequest("Request body must be valid JSON");
  }

  const bookIds = normalizeBookIds(body);
  if (bookIds.length === 0) {
    return badRequest("bookId is required");
  }

  try {
    const baseTime = Date.now();
    const statements = bookIds.map((bookId, index) =>
      context.env.DB
        .prepare(`
          INSERT INTO user_books (id, user_id, book_id, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(user_id, book_id) DO NOTHING
        `)
        .bind(crypto.randomUUID(), user.id, bookId, new Date(baseTime + index).toISOString())
    );

    await context.env.DB.batch(statements);
    return json({ ok: true, bookIds });
  } catch (error) {
    return serverError(error?.message || "Failed to save user books");
  }
}
