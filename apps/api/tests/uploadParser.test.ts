import type { AddressInfo } from "node:net";
import net from "node:net";
import type { Server } from "node:http";
import express from "express";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppError } from "../src/lib/errors.js";
import { parseUpload } from "../src/modules/prescriptions/upload.js";

/**
 * Regression coverage for the unhandled Busboy error.
 *
 * When a multipart body ends in the middle of a file part, Busboy destroys the per-file stream
 * with an error ("Unexpected end of form"). The parser used to listen to the Busboy instance but
 * not to that file stream, so the error surfaced as an uncaught exception that terminates the
 * Node process (Vitest reported it as an unhandled error after "rejects malformed multipart
 * structure"). These tests need no database, so they run in every environment.
 */

const MAX_BYTES = 1024;
const BOUNDARY = "xyz";
const CONTENT_TYPE = `multipart/form-data; boundary=${BOUNDARY}`;

const filePartHead = (fieldName: string) =>
  `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n`;
const completeFilePart = (fieldName: string, content: string) => `${filePartHead(fieldName)}${content}\r\n`;

interface Settled {
  ok: boolean;
  code?: string;
}

describe("parseUpload with malformed or interrupted multipart bodies", () => {
  let server: Server;
  let port: number;
  const uncaught: unknown[] = [];
  let settled: Settled[] = [];
  let onSettled: (() => void) | undefined;

  const onUncaught = (error: unknown) => {
    uncaught.push(error);
  };

  beforeAll(async () => {
    process.on("uncaughtException", onUncaught);
    const app = express();
    app.post("/upload", async (req, res) => {
      try {
        const upload = await parseUpload(req, MAX_BYTES);
        settled.push({ ok: true });
        onSettled?.();
        res.status(201).json({ size: upload.file.buffer.length, fields: upload.fields });
      } catch (error) {
        const code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
        settled.push({ ok: false, code });
        onSettled?.();
        const status = error instanceof AppError ? error.status : 500;
        if (!res.headersSent) res.status(status).json({ error: { code } });
      }
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    process.off("uncaughtException", onUncaught);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    uncaught.length = 0;
    settled = [];
    onSettled = undefined;
  });

  /** Error events are emitted on a later tick, so give them a chance to surface before asserting. */
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 50));
  const post = () => request(server).post("/upload").set("Content-Type", CONTENT_TYPE);

  const truncated: Array<[string, string]> = [
    ["a body that ends in the middle of the file part", `${filePartHead("file")}abc`],
    ["a body that ends in the middle of the part headers", `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filena`],
    ["a body that ends right after the opening boundary", `--${BOUNDARY}\r\n`],
    ["a complete file part with no closing boundary", `${completeFilePart("file", "abc")}--${BOUNDARY}`],
    ["a complete file part followed by nothing", completeFilePart("file", "abc")],
    ["a truncated file part with a wrong field name (discarded stream)", `${filePartHead("document")}abc`],
    ["a complete file part followed by a truncated second file (discarded stream)", `${completeFilePart("file", "abc")}${filePartHead("file")}def`],
    ["a truncated file part after a text field", `--${BOUNDARY}\r\nContent-Disposition: form-data; name="sourceType"\r\n\r\nuploaded_physical\r\n${filePartHead("file")}abc`],
  ];

  it.each(truncated)("returns a controlled 400 for %s", async (_label, body) => {
    const res = await post().send(body);
    await flush();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(uncaught).toEqual([]);
  });

  it("returns a controlled 400 for repeated truncated uploads without crashing", async () => {
    for (let i = 0; i < 25; i += 1) {
      const res = await post().send(`${filePartHead("file")}partial-${i}`);
      expect(res.status).toBe(400);
    }
    await flush();
    expect(uncaught).toEqual([]);
  });

  it("rejects without crashing when the client disconnects mid-upload", async () => {
    const done = new Promise<void>((resolve) => {
      onSettled = resolve;
    });
    const socket = net.connect(port, "127.0.0.1");
    socket.on("error", () => undefined);
    await new Promise<void>((resolve) => socket.once("connect", resolve));
    const partial = `${filePartHead("file")}abcdef`;
    socket.write(
      `POST /upload HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: ${CONTENT_TYPE}\r\nContent-Length: ${partial.length + 500}\r\n\r\n${partial}`,
    );
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    socket.destroy();
    await Promise.race([done, new Promise<void>((_, reject) => setTimeout(() => reject(new Error("parseUpload never settled after client abort")), 2000))]);
    await flush();
    expect(settled).toEqual([{ ok: false, code: "VALIDATION_ERROR" }]);
    expect(uncaught).toEqual([]);
  });

  it("still accepts a well-formed upload", async () => {
    const res = await request(server)
      .post("/upload")
      .field("sourceType", "uploaded_physical")
      .attach("file", Buffer.from("hello"), { filename: "a.png", contentType: "image/png" });
    await flush();
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ size: 5, fields: { sourceType: "uploaded_physical" } });
    expect(uncaught).toEqual([]);
  });

  it("still reports an oversized file as 413", async () => {
    const res = await request(server)
      .post("/upload")
      .attach("file", Buffer.alloc(MAX_BYTES + 10, 1), { filename: "a.png", contentType: "image/png" });
    await flush();
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
    expect(uncaught).toEqual([]);
  });

  it.each([
    ["no file part", () => post().send(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="sourceType"\r\n\r\nx\r\n--${BOUNDARY}--\r\n`)],
    ["a wrong field name", () => post().send(`${completeFilePart("document", "abc")}--${BOUNDARY}--\r\n`)],
    ["two file parts", () => post().send(`${completeFilePart("file", "abc")}${completeFilePart("file", "def")}--${BOUNDARY}--\r\n`)],
  ])("still rejects %s with a controlled 400", async (_label, send) => {
    const res = await send();
    await flush();
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(uncaught).toEqual([]);
  });
});
