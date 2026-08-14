import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";

const FORMAT = "scrypt-v1";
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost = COST, blockSize = BLOCK_SIZE, parallelization = PARALLELIZATION): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, {
    N: cost,
    r: blockSize,
    p: parallelization,
    maxmem: MAX_MEMORY,
  });
}

function deriveAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAX_MEMORY },
      (error, derivedKey) => (error ? reject(error) : resolve(derivedKey)),
    );
  });
}

function parseStoredHash(storedHash: string | null | undefined): { salt: Buffer; digest: Buffer } | null {
  if (!storedHash) return null;
  const [format, costValue, blockSizeValue, parallelizationValue, saltValue, digestValue, extra] =
    storedHash.split("$");
  if (format !== FORMAT || !saltValue || !digestValue || extra) return null;
  if (
    Number(costValue) !== COST ||
    Number(blockSizeValue) !== BLOCK_SIZE ||
    Number(parallelizationValue) !== PARALLELIZATION
  ) {
    return null;
  }
  try {
    const salt = Buffer.from(saltValue, "base64url");
    const digest = Buffer.from(digestValue, "base64url");
    if (salt.length < 16 || digest.length !== KEY_LENGTH) return null;
    return { salt, digest };
  } catch {
    return null;
  }
}

export function hashPassword(password: string, salt = randomBytes(16)): string {
  if (password.length < 12 || password.length > 200) {
    throw new Error("Production passwords must contain between 12 and 200 characters.");
  }
  const digest = derive(password, salt);
  return [
    FORMAT,
    String(COST),
    String(BLOCK_SIZE),
    String(PARALLELIZATION),
    salt.toString("base64url"),
    digest.toString("base64url"),
  ].join("$");
}

export function verifyPassword(password: string, storedHash: string | null | undefined): boolean {
  const parsed = parseStoredHash(storedHash);
  if (!parsed || password.length > 200) return false;
  try {
    const candidate = derive(password, parsed.salt);
    return parsed.digest.length === candidate.length && timingSafeEqual(parsed.digest, candidate);
  } catch {
    return false;
  }
}

export async function verifyPasswordAsync(
  password: string,
  storedHash: string | null | undefined,
): Promise<boolean> {
  const parsed = parseStoredHash(storedHash);
  if (!parsed || password.length > 200) return false;
  try {
    const candidate = await deriveAsync(password, parsed.salt);
    return parsed.digest.length === candidate.length && timingSafeEqual(parsed.digest, candidate);
  } catch {
    return false;
  }
}
