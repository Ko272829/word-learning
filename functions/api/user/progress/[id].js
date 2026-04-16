import { badRequest, json, parseJsonBody, serverError } from "../../../_utils/http.js";
import { requireUser } from "../../../_utils/auth.js";
import { nowIso } from "../../../_utils/user-data.js";

export async function onRequestPatch(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  const id = String(context.params?.id || "").trim();
  if (!id) {
    return badRequest("Progress id is required");
  }

  const body = await parseJsonBody(context.request);
  if (!body) {
    return badRequest("Request body must be valid JSON");
  }

  const bookId = String(body.bookId || "").trim();
  const wordId = String(body.wordId || "").trim();
  if (!bookId || !wordId) {
    return badRequest("bookId and wordId are required");
  }

  try {
    const existing = await context.env.DB
      .prepare("SELECT created_at FROM user_progress WHERE id = ? AND user_id = ? LIMIT 1")
      .bind(id, user.id)
      .first();

    if (!existing) {
      return json({ error: "Progress record not found" }, 404);
    }

    const now = nowIso();
    const progressData = {
      ...(body.progress && typeof body.progress === "object" ? body.progress : {}),
      status: body.status || "",
      lastReviewedAt: body.lastReviewedAt || body.last_reviewed_at || null,
      nextReviewAt: body.nextReviewAt || body.next_review_at || null
    };

    await context.env.DB
      .prepare(`
        UPDATE user_progress
        SET book_id = ?, word_id = ?, status = ?, last_reviewed_at = ?, next_review_at = ?, data = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `)
      .bind(
        bookId,
        wordId,
        progressData.status || null,
        progressData.lastReviewedAt || null,
        progressData.nextReviewAt || null,
        JSON.stringify(progressData),
        now,
        id,
        user.id
      )
      .run();

    return json({ ok: true, id });
  } catch (error) {
    return serverError(error?.message || "Failed to update progress");
  }
}
