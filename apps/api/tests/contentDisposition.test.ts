import { describe, expect, it } from "vitest";
import http from "node:http";
import { contentDisposition } from "../src/lib/contentDisposition.js";

describe("contentDisposition", () => {
  it("keeps plain ASCII names readable", () => {
    expect(contentDisposition("inline", "scan.jpg")).toBe(`inline; filename="scan.jpg"`);
  });

  it("never produces a header Node refuses, for any script", () => {
    const names = ["पर्चा.jpg", "处方.png", "résumé.jpg", 'a"b\\c.png', "line\r\nbreak.pdf", "😀.webp", "", "   "];
    for (const name of names) {
      const value = contentDisposition("inline", name);
      expect(/^[\x20-\x7e]+$/.test(value)).toBe(true);
      const req = new http.ServerResponse(new http.IncomingMessage(null as never));
      expect(() => req.setHeader("Content-Disposition", value)).not.toThrow();
    }
  });

  it("round-trips the real name in filename*", () => {
    const value = contentDisposition("attachment", "पर्चा.jpg");
    const encoded = /filename\*=UTF-8''(.+)$/.exec(value)?.[1] ?? "";
    expect(decodeURIComponent(encoded)).toBe("पर्चा.jpg");
    expect(value).toContain('filename="download.jpg"');
  });
});
