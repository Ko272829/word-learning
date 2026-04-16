import { badRequest, json, serverError } from "../../../_utils/http.js";
import { requireUser } from "../../../_utils/auth.js";

export async function onRequestDelete(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  const id = String(context.params?.id || "").trim();
  if (!id) {
    return badRequest("Favorite id is required");
  }

  try {
    await context.env.DB
      .prepare("DELETE FROM user_favorites WHERE id = ? AND user_id = ?")
      .bind(id, user.id)
      .run();

    return json({ ok: true, id });
  } catch (error) {
    return serverError(error?.message || "Failed to delete favorite");
  }
}
