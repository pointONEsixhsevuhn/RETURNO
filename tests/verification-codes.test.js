import "./test-env.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  assertCodePepper,
  digestVerificationCode,
  isCurrentVerificationCodeDigest,
  verifyVerificationCode,
} from "../verification-codes.js";

test("verification codes use keyed, purpose-separated digests", () => {
  const code = "123456";
  const stored = digestVerificationCode("signup", code);
  assert.match(stored, /^hmac-sha256-v1:[\da-f]{16}:[\da-f]{64}$/);
  assert.equal(isCurrentVerificationCodeDigest(stored), true);
  assert.equal(verifyVerificationCode("signup", code, stored), true);
  assert.equal(verifyVerificationCode("password-reset", code, stored), false);
  assert.equal(verifyVerificationCode("signup", "654321", stored), false);
  assert.notEqual(stored, createHash("sha256").update(code).digest("hex"));
  assert.equal(verifyVerificationCode("signup", code, "legacy-plain-hash"), false);
});

test("the code pepper must be exactly 32 random bytes encoded as hex", () => {
  assertCodePepper("ab".repeat(32));
  for (const invalid of ["", "a".repeat(63), "g".repeat(64)]) {
    assert.throws(() => assertCodePepper(invalid), /RETURNO_CODE_PEPPER/);
  }
});

test("legacy unkeyed code digests cannot verify after the code format change", () => {
  const oldDigest = createHash("sha256").update("123456").digest("hex");
  assert.equal(verifyVerificationCode("signup", "123456", oldDigest), false);
});

test("rotating the pepper invalidates old records so they can be reissued", () => {
  const previous = process.env.RETURNO_CODE_PEPPER;
  const stored = digestVerificationCode("password-reset", "123456");
  try {
    process.env.RETURNO_CODE_PEPPER = "c".repeat(64);
    assert.equal(isCurrentVerificationCodeDigest(stored), false);
    assert.equal(verifyVerificationCode("password-reset", "123456", stored), false);
  } finally {
    process.env.RETURNO_CODE_PEPPER = previous;
  }
});
