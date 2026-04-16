import { badRequest, json, parseJsonBody, serverError } from "../../_utils/http.js";
import { requireUser } from "../../_utils/auth.js";
import { normalizeSettings, nowIso, parseSettingValue } from "../../_utils/user-data.js";

export async function onRequestGet(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  try {
    const results = await context.env.DB
      .prepare("SELECT id, key, value, created_at, updated_at FROM user_settings WHERE user_id = ? ORDER BY key ASC")
      .bind(user.id)
      .all();

    const items = results.results || [];
    const settings = items.reduce((map, item) => {
      map[item.key] = parseSettingValue(item.value);
      return map;
    }, {});

    return json({
      items: items.map((item) => ({
        id: item.id,
        key: item.key,
        value: parseSettingValue(item.value),
        createdAt: item.created_at,
        updatedAt: item.updated_at
      })),
      settings
    });
  } catch (error) {
    return serverError(error?.message || "Failed to fetch settings");
  }
}

export async function onRequestPatch(context) {
  const { user, response } = await requireUser(context);
  if (response) return response;

  const body = await parseJsonBody(context.request);
  if (!body) {
    return badRequest("Request body must be valid JSON");
  }

  const settings = normalizeSettings(body);
  const entries = Object.entries(settings);
  if (entries.length === 0) {
    return badRequest("settings are required");
  }

  try {
    const now = nowIso();
    const statements = entries.map(([key, value]) =>
      context.env.DB
        .prepare(`
          INSERT INTO user_settings (id, user_id, key, value, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `)
        .bind(crypto.randomUUID(), user.id, key, value, now, now)
    );

    await context.env.DB.batch(statements);
    return json({ ok: true, keys: entries.map(([key]) => key) });
  } catch (error) {
    return serverError(error?.message || "Failed to save settings");
  }
}
