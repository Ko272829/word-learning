import {
  badRequest,
  json,
  parseJsonBody,
  serializeCookie,
  isHttpsRequest,
  serverError
} from "../../_utils/http.js";
import {
  buildSessionCookieValue,
  createSession,
  getSessionCookieName,
  hashPassword,
  isValidEmail
} from "../../_utils/auth.js";
import { nowIso } from "../../_utils/user-data.js";

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  if (!body) {
    return badRequest("Request body must be valid JSON");
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const username = String(body.username || "").trim();

  if (!isValidEmail(email)) {
    return badRequest("Please enter a valid email address");
  }
  if (password.length < 6) {
    return badRequest("Password must be at least 6 characters");
  }

  try {
    const existing = await context.env.DB.prepare("SELECT id FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first();
    if (existing) {
      return json({ error: "Email already exists" }, 409);
    }

    const userId = crypto.randomUUID();
    const timestamp = nowIso();
    const passwordHash = await hashPassword(password);

    await context.env.DB
      .prepare(`
        INSERT INTO users (id, email, username, password_hash, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(userId, email, username || null, passwordHash, timestamp, timestamp)
      .run();

    const session = await createSession(context.env.DB, userId);
    const cookie = serializeCookie(
      getSessionCookieName(),
      buildSessionCookieValue(session.sessionId, session.sessionToken),
      {
        httpOnly: true,
        sameSite: "Lax",
        secure: isHttpsRequest(context.request),
        path: "/",
        maxAge: session.maxAge
      }
    );

    return json(
      {
        user: {
          id: userId,
          email,
          username
        }
      },
      201,
      { "set-cookie": cookie }
    );
  } catch (error) {
    return serverError(error?.message || "Register failed");
  }
}
