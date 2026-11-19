import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, fingerprintKey, last4 } from "./secrets";

const TEST_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryptSecret / decryptSecret", () => {
  const previous = process.env.ACS_CREDENTIAL_ENCRYPTION_KEY;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.ACS_CREDENTIAL_ENCRYPTION_KEY;
    } else {
      process.env.ACS_CREDENTIAL_ENCRYPTION_KEY = previous;
    }
  });

  it("roundtrips plaintext when ACS_CREDENTIAL_ENCRYPTION_KEY is set", () => {
    process.env.ACS_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;

    const plaintext = "sk-test-secret-value-never-log-me";
    const encrypted = encryptSecret(plaintext);

    expect(encrypted).toMatch(/^[^:]+:[^:]+:[^:]+$/);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("accepts an explicit encryption key override", () => {
    delete process.env.ACS_CREDENTIAL_ENCRYPTION_KEY;

    const plaintext = "byok-key-material";
    const encrypted = encryptSecret(plaintext, TEST_KEY);
    expect(decryptSecret(encrypted, TEST_KEY)).toBe(plaintext);
  });

  it("produces distinct ciphertexts for the same plaintext (random IV)", () => {
    process.env.ACS_CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;

    const a = encryptSecret("same-secret");
    const b = encryptSecret("same-secret");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same-secret");
    expect(decryptSecret(b)).toBe("same-secret");
  });
});

describe("fingerprintKey / last4", () => {
  it("fingerprints stably and exposes last 4 safely", () => {
    expect(fingerprintKey("sk-abc12345")).toHaveLength(64);
    expect(fingerprintKey("sk-abc12345")).toBe(fingerprintKey("sk-abc12345"));
    expect(last4("sk-abc12345")).toBe("2345");
  });
});
