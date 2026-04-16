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
  verifyPassword
} from "../../_utils/auth.js";

export async function onRequestPost(context) {
  const body = await parseJsonBody(context.request);
  if (!body) {
    return badRequest("Request body must be valid JSON");
  }

  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!email || !password) {
    return badRequest("Email and password are required");
  }

  try {
    const user = await context.env.DB
      .prepare("SELECT id, email, username, password_hash FROM users WHERE email = ? LIMIT 1")
      .bind(email)
      .first();

    if (!user) {
      return json({ error: "Invalid email or password" }, 401);
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return json({ error: "Invalid email or password" }, 401);
    }

    const session = await createSession(context.env.DB, user.id);
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
          id: user.id,
          email: user.email,
          username: user.username || ""
        }
      },
      200,
      { "set-cookie": cookie }
    );
  } catch (error) {
    return serverError(error?.message || "Login failed");
  }
}
