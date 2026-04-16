import { json, serverError } from "../../../_utils/http.js";
import { requireUser } from "../../../_utils/auth.js";

export async function onRequestDelete(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  const bookId = String(context.params?.bookId || "").trim();
  if (!bookId) {
    return json({ error: "bookId is required" }, 400);
  }

  try {
    await context.env.DB
      .prepare("DELETE FROM user_books WHERE user_id = ? AND book_id = ?")
      .bind(user.id, bookId)
      .run();

    return json({ ok: true, bookId });
  } catch (error) {
    return serverError(error?.message || "Failed to remove user book");
  }
}
