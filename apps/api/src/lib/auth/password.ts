import argon2 from "argon2";

// OWASP minimum argon2id configuration: small enough for a free-tier host.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Verifies a password. When no hash exists (unknown email) it still performs a
 * full verification against a throwaway hash so response time does not reveal
 * whether the account exists.
 */
export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= hashPassword("timing-equalisation-only");
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
