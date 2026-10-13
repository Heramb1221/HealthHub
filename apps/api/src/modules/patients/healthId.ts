import { randomBytes } from "node:crypto";

// Crockford base32: no I, L, O, U, so IDs are hard to misread when typed.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Random display identifier such as `HH-7K2M9QXD` (40 bits of randomness).
 * It encodes nothing about the patient and is not a secret or a credential.
 * Uniqueness is guaranteed by the database constraint, not by this function;
 * callers retry on a unique violation.
 */
export function generateHealthId(): string {
  const bytes = randomBytes(8);
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % 32];
  return `HH-${id}`;
}
