import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateHealthId(): string {
  const bytes = randomBytes(8);
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % 32];
  return `HH-${id}`;
}
