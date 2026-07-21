import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const scryptCost = 16_384;
const scryptBlockSize = 8;
const scryptParallelization = 1;
const passwordKeyLength = 64;

export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, passwordKeyLength, {
    N: scryptCost,
    r: scryptBlockSize,
    p: scryptParallelization,
    maxmem: 64 * 1024 * 1024
  });

  return [
    "scrypt",
    scryptCost,
    scryptBlockSize,
    scryptParallelization,
    salt.toString("base64url"),
    derived.toString("base64url")
  ].join("$");
}

export function verifyPassword(password: string, encodedHash: string) {
  const [algorithm, costText, blockSizeText, parallelizationText, saltText, hashText] = encodedHash.split("$");
  if (algorithm !== "scrypt" || !costText || !blockSizeText || !parallelizationText || !saltText || !hashText) {
    return false;
  }

  const cost = Number(costText);
  const blockSize = Number(blockSizeText);
  const parallelization = Number(parallelizationText);
  if (
    cost !== scryptCost
    || blockSize !== scryptBlockSize
    || parallelization !== scryptParallelization
  ) {
    return false;
  }

  const expected = Buffer.from(hashText, "base64url");
  const salt = Buffer.from(saltText, "base64url");
  if (expected.length !== passwordKeyLength || salt.length !== 16) {
    return false;
  }

  try {
    const actual = scryptSync(password, salt, passwordKeyLength, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: 64 * 1024 * 1024
    });
    return timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function signValue(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
