import { json, serverError } from "../../_utils/http.js";
import { getCurrentUser } from "../../_utils/auth.js";

export async function onRequestGet(context) {
  try {
    const user = await getCurrentUser(context);
    return json({
      user: user
        ? {
            id: user.id,
            email: user.email,
            username: user.username
          }
        : null
    });
  } catch (error) {
    return serverError(error?.message || "Failed to fetch current user");
  }
}
