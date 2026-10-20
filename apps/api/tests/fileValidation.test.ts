import { describe, expect, it } from "vitest";
import { normalizeDeclaredMime, sanitizeFileName, sniffMime } from "../src/modules/prescriptions/fileValidation.js";

const pad = (head: number[], extra = 16) => Buffer.concat([Buffer.from(head), Buffer.alloc(extra, 1)]);

describe("sniffMime", () => {
  it("identifies the four allowed types by their leading bytes", () => {
    expect(sniffMime(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMime(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBPVP8 ")]))).toBe("image/webp");
    expect(sniffMime(Buffer.from("%PDF-1.7\n%%EOF"))).toBe("application/pdf");
  });

  it("rejects everything else", () => {
    const rejected: Buffer[] = [
      Buffer.alloc(0),
      Buffer.from("MZ\x90\x00 executable"),
      Buffer.from("#!/bin/sh\necho hi"),
      Buffer.from("<html><script>alert(1)</script>"),
      Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
      Buffer.from("GIF89a"),
      Buffer.from("PK\x03\x04 zip"),
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt ")]),
      Buffer.from("%PDF"),
      Buffer.from("  %PDF-1.4"),
    ];
    for (const buffer of rejected) expect(sniffMime(buffer), JSON.stringify(buffer.subarray(0, 12).toString("latin1"))).toBeNull();
  });
});

describe("normalizeDeclaredMime", () => {
  it("lowercases, drops parameters, and maps image/jpg", () => {
    expect(normalizeDeclaredMime("IMAGE/PNG")).toBe("image/png");
    expect(normalizeDeclaredMime("image/jpeg; charset=binary")).toBe("image/jpeg");
    expect(normalizeDeclaredMime("image/jpg")).toBe("image/jpeg");
    expect(normalizeDeclaredMime("")).toBe("");
  });
});

describe("sanitizeFileName", () => {
  it("keeps normal names", () => {
    expect(sanitizeFileName("prescription-01.png")).toBe("prescription-01.png");
    expect(sanitizeFileName("Dr Rao visit 2026.pdf")).toBe("Dr Rao visit 2026.pdf");
  });

  it("strips directories and traversal", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Windows\\evil.png")).toBe("evil.png");
    expect(sanitizeFileName("/abs/path/file.jpg")).toBe("file.jpg");
    expect(sanitizeFileName("..")).toBe("upload");
    expect(sanitizeFileName("../")).toBe("upload");
  });

  it("removes control characters and replaces unsafe ones", () => {
    expect(sanitizeFileName("a\nb\tc\u0000.png")).toBe("abc.png");
    expect(sanitizeFileName("<img src=x onerror=alert(1)>.png")).toBe("_img src_x onerror_alert_1__.png");

    expect(sanitizeFileName("<script>alert(1)</script>.png")).toBe("script_.png");
    expect(sanitizeFileName("name\u202e.png")).toBe("name_.png");
    expect(sanitizeFileName("a;rm -rf *.png")).toBe("a_rm -rf _.png");
  });

  it("drops leading dots, bounds length, and falls back for empty names", () => {
    expect(sanitizeFileName(".hidden")).toBe("hidden");
    expect(sanitizeFileName("x".repeat(500)).length).toBe(100);
    for (const empty of [undefined, "", "   ", "\n\n", "...", "\u0000"]) expect(sanitizeFileName(empty)).toBe("upload");
  });

  it("keeps letters and combining marks from other scripts", () => {
    expect(sanitizeFileName("प्रिस्क्रिप्शन.pdf")).toBe("प्रिस्क्रिप्शन.pdf");
    expect(sanitizeFileName("処方箋.png")).toBe("処方箋.png");
  });
});
