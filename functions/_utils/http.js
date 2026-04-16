export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    }
  });

export const parseJsonBody = async (request) => {
  try {
    return await request.json();
  } catch {
    return null;
  }
};

export const badRequest = (error, extras = {}) => json({ error, ...extras }, 400);
export const unauthorized = (error = "Unauthorized") => json({ error }, 401);
export const forbidden = (error = "Forbidden") => json({ error }, 403);
export const notFound = (error = "Not Found") => json({ error }, 404);
export const serverError = (error = "Server Error", extras = {}) => json({ error, ...extras }, 500);

export const parseCookies = (request) => {
  const raw = request.headers.get("cookie") || "";
  return raw.split(";").reduce((cookies, pair) => {
    const [name, ...valueParts] = pair.trim().split("=");
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(valueParts.join("=") || "");
    return cookies;
  }, {});
};

export const serializeCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  if (options.expires) parts.push(`Expires=${new Date(options.expires).toUTCString()}`);
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  return parts.join("; ");
};

export const deleteCookie = (name, options = {}) =>
  serializeCookie(name, "", {
    ...options,
    expires: new Date(0).toISOString(),
    maxAge: 0
  });

export const isHttpsRequest = (request) => {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
};
