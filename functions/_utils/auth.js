import { parseCookies, unauthorized } from "./http.js";

const SESSION_COOKIE_NAME = "vocab_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 100000;

const textEncoder = new TextEncoder();

const toBase64 = (bytes) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (value) =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const bytesToHex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const derivePasswordHash = async (password, saltBytes, iterations = PASSWORD_ITERATIONS) => {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations,
      hash: "SHA-256"
    },
    keyMaterial,
    256
  );
  return new Uint8Array(bits);
};

export const isValidEmail = (email) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim().toLowerCase());

export const hashPassword = async (password) => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hashBytes = await derivePasswordHash(password, salt);
  return `pbkdf2_sha256$${PASSWORD_ITERATIONS}$${toBase64(salt)}$${toBase64(hashBytes)}`;
};

export const verifyPassword = async (password, storedHash) => {
  const [algorithm, iterationsRaw, saltBase64, hashBase64] = String(storedHash || "").split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterationsRaw || !saltBase64 || !hashBase64) {
    return false;
  }

  const iterations = Number(iterationsRaw);
  const salt = fromBase64(saltBase64);
  const expectedHash = fromBase64(hashBase64);
  const actualHash = await derivePasswordHash(password, salt, iterations);

  if (actualHash.length !== expectedHash.length) return false;

  let diff = 0;
  for (let index = 0; index < actualHash.length; index += 1) {
    diff |= actualHash[index] ^ expectedHash[index];
  }
  return diff === 0;
};

export const hashSessionToken = async (token) => {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(token));
  return bytesToHex(new Uint8Array(digest));
};

export const createSession = async (db, userId) => {
  const sessionId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();

  await db
    .prepare(
      `
      INSERT INTO sessions (id, user_id, session_token_hash, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?)
      `
    )
    .bind(sessionId, userId, await hashSessionToken(sessionToken), expiresAt, now)
    .run();

  return {
    sessionId,
    sessionToken,
    expiresAt,
    maxAge: SESSION_MAX_AGE_SECONDS
  };
};

export const buildSessionCookieValue = (sessionId, sessionToken) => `${sessionId}.${sessionToken}`;

export const parseSessionCookie = (request) => {
  const cookies = parseCookies(request);
  const cookieValue = cookies[SESSION_COOKIE_NAME];
  if (!cookieValue) return null;

  const separatorIndex = cookieValue.indexOf(".");
  if (separatorIndex === -1) return null;

  return {
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    sessionId: cookieValue.slice(0, separatorIndex),
    sessionToken: cookieValue.slice(separatorIndex + 1)
  };
};

export const getSessionCookieName = () => SESSION_COOKIE_NAME;

export const getCurrentUser = async (context) => {
  const session = parseSessionCookie(context.request);
  if (!session?.sessionId || !session?.sessionToken) {
    return null;
  }

  const row = await context.env.DB
    .prepare(
      `
      SELECT sessions.id AS session_id, sessions.user_id, sessions.session_token_hash, sessions.expires_at,
             users.email, users.username, users.created_at, users.updated_at
      FROM sessions
      INNER JOIN users ON users.id = sessions.user_id
      WHERE sessions.id = ?
      LIMIT 1
      `
    )
    .bind(session.sessionId)
    .first();

  if (!row) {
    return null;
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    await context.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(session.sessionId).run();
    return null;
  }

  const tokenHash = await hashSessionToken(session.sessionToken);
  if (tokenHash !== row.session_token_hash) {
    return null;
  }

  return {
    id: row.user_id,
    email: row.email,
    username: row.username || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    sessionId: row.session_id,
    sessionExpiresAt: row.expires_at
  };
};

export const requireUser = async (context) => {
  const user = await getCurrentUser(context);
  if (!user) {
    return { user: null, response: unauthorized("请先登录") };
  }
  return { user, response: null };
};
