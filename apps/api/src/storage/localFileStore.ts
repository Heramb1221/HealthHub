import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { PrivateFileStore } from "./types.js";

const KEY_PATTERN = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;

export class LocalFileStore implements PrivateFileStore {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = resolve(rootDir);
  }

  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key) || key.length > 200) throw new Error("invalid storage key");
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new Error("invalid storage key");
    return path;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, data, { mode: 0o600, flag: "wx" });
      await rename(temp, path);
    } catch (err) {
      await rm(temp, { force: true });
      throw err;
    }
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}
