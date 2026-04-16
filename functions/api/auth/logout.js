import { deleteCookie, json, isHttpsRequest, serverError } from "../../_utils/http.js";
import { getSessionCookieName, parseSessionCookie } from "../../_utils/auth.js";

export async function onRequestPost(context) {
  try {
    const session = parseSessionCookie(context.request);
    if (session?.sessionId) {
      await context.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(session.sessionId).run();
    }

    return json(
      { ok: true },
      200,
      {
        "set-cookie": deleteCookie(getSessionCookieName(), {
          path: "/",
          httpOnly: true,
          sameSite: "Lax",
          secure: isHttpsRequest(context.request)
        })
      }
    );
  } catch (error) {
    return serverError(error?.message || "Logout failed");
  }
}
