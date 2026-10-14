import { createHmac, timingSafeEqual } from "node:crypto";

const pepperPattern = /^[\da-f]{64}$/i;
const digestVersion = "hmac-sha256-v1";

export function assertCodePepper(value = process.env.RETURNO_CODE_PEPPER) {
  if (typeof value !== "string" || !pepperPattern.test(value)) {
    throw new Error(
      "RETURNO_CODE_PEPPER must be a 64-character hex string (32 random bytes). See docs/EMAIL-VERIFICATION.md.",
    );
  }
}

export function digestVerificationCode(purpose, code) {
  assertCodePepper();
  if (!["signup", "password-reset"].includes(purpose)) {
    throw new Error("Invalid verification-code purpose.");
  }
  const key = Buffer.from(process.env.RETURNO_CODE_PEPPER, "hex");
  const keyId = createHmac("sha256", key)
    .update("RETURNO:code-key-id:v1")
    .digest("hex")
    .slice(0, 16);
  const digest = createHmac("sha256", key)
    .update(`RETURNO:${digestVersion}:${purpose}:`)
    .update(code)
    .digest("hex");
  return `${digestVersion}:${keyId}:${digest}`;
}

export function isCurrentVerificationCodeDigest(storedDigest) {
  if (typeof storedDigest !== "string") return false;
  const [version, keyId, hex] = storedDigest.split(":");
  if (
    version !== digestVersion ||
    !/^[\da-f]{16}$/i.test(keyId || "") ||
    !/^[\da-f]{64}$/i.test(hex || "")
  )
    return false;
  assertCodePepper();
  const key = Buffer.from(process.env.RETURNO_CODE_PEPPER, "hex");
  const currentKeyId = createHmac("sha256", key)
    .update("RETURNO:code-key-id:v1")
    .digest("hex")
    .slice(0, 16);
  return keyId === currentKeyId;
}

export function verifyVerificationCode(purpose, code, storedDigest) {
  if (!isCurrentVerificationCodeDigest(storedDigest)) return false;
  const [, , hex] = storedDigest.split(":");
  const expected = Buffer.from(hex, "hex");
  const actual = Buffer.from(digestVerificationCode(purpose, code).split(":")[2], "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
