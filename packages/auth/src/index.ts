import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const passwordHashAlgorithm = 'scrypt-v1';
const keyLength = 64;
const scryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 64 * 1024 * 1024,
} satisfies ScryptOptions;

function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, scryptOptions, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(derivedKey);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivedKey = await derivePasswordKey(password, salt);
  return [
    passwordHashAlgorithm,
    String(scryptOptions.N),
    String(scryptOptions.r),
    String(scryptOptions.p),
    salt.toString('base64url'),
    derivedKey.toString('base64url'),
  ].join('$');
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, n, r, p, encodedSalt, encodedKey, ...extra] = encodedHash.split('$');
  if (
    algorithm !== passwordHashAlgorithm ||
    n !== String(scryptOptions.N) ||
    r !== String(scryptOptions.r) ||
    p !== String(scryptOptions.p) ||
    !encodedSalt ||
    !encodedKey ||
    extra.length > 0
  ) {
    return false;
  }

  try {
    const expectedKey = Buffer.from(encodedKey, 'base64url');
    if (expectedKey.length !== keyLength) {
      return false;
    }
    const actualKey = await derivePasswordKey(password, Buffer.from(encodedSalt, 'base64url'));
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
