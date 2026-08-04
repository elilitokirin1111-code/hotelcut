import { describe, expect, it } from 'vitest';

import { generateSessionToken, hashPassword, hashSessionToken, verifyPassword } from './index.js';

describe('authentication primitives', () => {
  it('hashes and verifies passwords without storing the plaintext', async () => {
    const password = 'hotelcut-local';
    const encoded = await hashPassword(password);

    expect(encoded).not.toContain(password);
    await expect(verifyPassword(password, encoded)).resolves.toBe(true);
    await expect(verifyPassword('wrong-password', encoded)).resolves.toBe(false);
    await expect(verifyPassword(password, 'invalid-hash')).resolves.toBe(false);
  });

  it('generates opaque session tokens and stable digests', () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).not.toBe(second);
    expect(hashSessionToken(first)).toHaveLength(64);
    expect(hashSessionToken(first)).toBe(hashSessionToken(first));
    expect(hashSessionToken(first)).not.toBe(hashSessionToken(second));
  });
});
