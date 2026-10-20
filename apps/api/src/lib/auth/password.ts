import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

const OPTIONS = { memorySize: 19_456, iterations: 2, parallelism: 1, hashLength: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return argon2id({
    password,
    salt,
    parallelism: OPTIONS.parallelism,
    iterations: OPTIONS.iterations,
    memorySize: OPTIONS.memorySize,
    hashLength: OPTIONS.hashLength,
    outputType: "encoded",
  });
}

let dummyHash: Promise<string> | undefined;

export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (hash === null) {
    dummyHash ??= hashPassword("timing-equalisation-only");
    await argon2Verify({ password, hash: await dummyHash }).catch(() => false);
    return false;
  }
  try {
    return await argon2Verify({ password, hash });
  } catch {
    return false;
  }
}
