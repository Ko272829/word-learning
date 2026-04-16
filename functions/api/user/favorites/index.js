import { badRequest, json, parseJsonBody, serverError } from "../../../_utils/http.js";
import { requireUser } from "../../../_utils/auth.js";
import { normalizeFavorites, nowIso } from "../../../_utils/user-data.js";

export async function onRequestGet(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  try {
    const results = await context.env.DB
      .prepare("SELECT id, item_type, item_id, created_at FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC")
      .bind(user.id)
      .all();

    return json({
      items: (results.results || []).map((item) => ({
        id: item.id,
        itemType: item.item_type,
        itemId: item.item_id,
        createdAt: item.created_at
      }))
    });
  } catch (error) {
    return serverError(error?.message || "Failed to fetch favorites");
  }
}

export async function onRequestPost(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  const body = await parseJsonBody(context.request);
  if (!body) {
    return badRequest("Request body must be valid JSON");
  }

  const items = normalizeFavorites(body);
  if (items.length === 0) {
    return badRequest("Favorite items are required");
  }

  try {
    const now = nowIso();
    const statements = items.map((item) =>
      context.env.DB
        .prepare(`
          INSERT INTO user_favorites (id, user_id, item_type, item_id, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, item_type, item_id) DO NOTHING
        `)
        .bind(crypto.randomUUID(), user.id, item.itemType, item.itemId, now)
    );

    await context.env.DB.batch(statements);
    return json({ ok: true, count: items.length });
  } catch (error) {
    return serverError(error?.message || "Failed to save favorites");
  }
}
