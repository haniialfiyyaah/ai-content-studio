import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { AppError, ErrorCodes } from "@acs/schemas";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a 32-byte AES key from ACS_CREDENTIAL_ENCRYPTION_KEY.
 * Accepts 64-char hex or any utf8 string (padded/hashed to 32 bytes).
 */
function resolveEncryptionKey(raw?: string): Buffer {
  const value = raw ?? process.env.ACS_CREDENTIAL_ENCRYPTION_KEY;
  if (!value) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "ACS_CREDENTIAL_ENCRYPTION_KEY is not configured",
      500,
    );
  }

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, "hex");
  }

  // WHY: utf8 keys from .env may be shorter than 32 bytes; hash for fixed length.
  if (value.length === 32) {
    return Buffer.from(value, "utf8");
  }

  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Encrypts a secret with AES-256-GCM.
 * Returns `iv:authTag:ciphertext` as base64 segments (never log this or plaintext).
 */
export function encryptSecret(
  plaintext: string,
  encryptionKey?: string,
): string {
  const key = resolveEncryptionKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

/** Decrypts a value produced by encryptSecret. */
export function decryptSecret(
  payload: string,
  encryptionKey?: string,
): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Invalid encrypted secret payload",
      500,
    );
  }

  const [ivB64, tagB64, dataB64] = parts;
  const key = resolveEncryptionKey(encryptionKey);
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new AppError(
      ErrorCodes.INTERNAL_ERROR,
      "Invalid encrypted secret framing",
      500,
    );
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Stable fingerprint for key rotation / dedupe — never reverseable to the key. */
export function fingerprintKey(apiKey: string): string {
  return createHash("sha256").update(apiKey, "utf8").digest("hex");
}

/** Last 4 characters for UI display (empty-safe). */
export function last4(apiKey: string): string {
  if (apiKey.length < 4) return apiKey.padStart(4, "*");
  return apiKey.slice(-4);
}
