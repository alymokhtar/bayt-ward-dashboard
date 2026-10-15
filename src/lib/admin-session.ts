import { createHmac, timingSafeEqual } from "node:crypto";

export const ADMIN_SESSION_COOKIE = "bayt_ward_admin";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

function sessionSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

export function createAdminSession() {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

export function isValidAdminSession(token: string | undefined) {
  if (!token) return false;
  const [expiresAt, signature, extra] = token.split(".");
  if (!expiresAt || !signature || extra || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;

  try {
    const expected = Buffer.from(sign(expiresAt));
    const actual = Buffer.from(signature);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function isValidAdminPassword(password: string) {
  const expected = process.env.ADMIN_PASSWORD;
  const minimumLength = process.env.NODE_ENV === "development" ? 6 : 16;
  if (!expected || expected.length < minimumLength) {
    throw new Error(`ADMIN_PASSWORD must contain at least ${minimumLength} characters.`);
  }

  const key = sessionSecret();
  const expectedHash = createHmac("sha256", key).update(expected).digest();
  const actualHash = createHmac("sha256", key).update(password).digest();
  return timingSafeEqual(expectedHash, actualHash);
}
