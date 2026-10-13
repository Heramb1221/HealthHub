import { mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalFileStore } from "../src/storage/localFileStore.js";

describe("LocalFileStore", () => {
  let root: string;
  let store: LocalFileStore;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "hh-store-test-"));
    store = new LocalFileStore(root);
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores, reads back, and deletes bytes", async () => {
    const data = Buffer.from([1, 2, 3, 250, 251]);
    await store.put("prescriptions/patient-1/file-1", data);
    expect(await store.read("prescriptions/patient-1/file-1")).toEqual(data);
    await store.delete("prescriptions/patient-1/file-1");
    expect(await store.read("prescriptions/patient-1/file-1")).toBeNull();
  });

  it("returns null for a missing file and ignores deleting one", async () => {
    expect(await store.read("nothing/here")).toBeNull();
    await expect(store.delete("nothing/here")).resolves.toBeUndefined();
  });

  it("creates files readable only by the owner and leaves no temp files", async () => {
    await store.put("perm/check/file", Buffer.from("x"));
    expect((await stat(join(root, "perm/check/file"))).mode & 0o777).toBe(0o600);
    expect((await stat(join(root, "perm/check"))).mode & 0o777).toBe(0o700);
    expect((await readdir(join(root, "perm/check"))).every((name) => !name.endsWith(".tmp"))).toBe(true);
  });

  it("rejects any key that could escape the storage root", async () => {
    const bad = ["../outside", "a/../../outside", "/etc/passwd", "a\\b", "A/B", "a//b", "a/b/", "a.b", "", "a b", "%2e%2e/x", "a/./b", "x".repeat(201)];
    for (const key of bad) {
      await expect(store.put(key, Buffer.from("x")), `put ${JSON.stringify(key)}`).rejects.toThrow("invalid storage key");
      await expect(store.read(key), `read ${JSON.stringify(key)}`).rejects.toThrow("invalid storage key");
      await expect(store.delete(key), `delete ${JSON.stringify(key)}`).rejects.toThrow("invalid storage key");
    }
  });

  it("cleans up its temp file when the write fails", async () => {
    await writeFile(join(root, "blocked"), "i am a file, not a directory");
    await expect(store.put("blocked/child", Buffer.from("x"))).rejects.toBeDefined();
    expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });
});
