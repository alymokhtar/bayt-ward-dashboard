import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey() {
  const configuredKey = process.env.META_TOKEN_ENCRYPTION_KEY;
  if (!configuredKey) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY must be configured.");
  }

  const key = Buffer.from(configuredKey, "base64");
  if (key.length !== 32) {
    throw new Error("META_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${authTag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function decryptToken(value: string) {
  const [version, ivValue, tagValue, encryptedValue, extra] = value.split(":");
  if (version !== "v1" || !ivValue || !tagValue || encryptedValue === undefined || extra) {
    throw new Error("The encrypted access token has an unsupported format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptMetaToken(token: string) {
  return encryptToken(token);
}

export function decryptMetaToken(value: string) {
  return decryptToken(value);
}

export function encryptYoutubeToken(token: string) {
  return encryptToken(token);
}

export function decryptYoutubeToken(value: string) {
  return decryptToken(value);
}

export function encryptTikTokToken(token: string) {
  return encryptToken(token);
}

export function decryptTikTokToken(value: string) {
  return decryptToken(value);
}

export function encryptSnapchatToken(token: string) {
  return encryptToken(token);
}

export function decryptSnapchatToken(value: string) {
  return decryptToken(value);
}
