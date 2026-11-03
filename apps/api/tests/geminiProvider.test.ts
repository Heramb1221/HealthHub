import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiExtractionProvider } from "../src/extraction/geminiProvider.js";

const okResponse = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("GeminiExtractionProvider (mocked network, no real calls)", () => {
  it("sends the API key in a header, never in the URL", async () => {
    const fetchMock = vi.fn(async () => okResponse({ medications: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await new GeminiExtractionProvider("secret-key-123").extract({ bytes: Buffer.from("x"), mimeType: "image/png" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain("secret-key-123");
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("secret-key-123");
  });

  it("tells the model who the prescriber is and is not, and not to guess", async () => {
    const fetchMock = vi.fn(async () => okResponse({ medications: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await new GeminiExtractionProvider("k").extract({ bytes: Buffer.from("x"), mimeType: "image/png" });
    const body = JSON.parse(((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)) as { contents: { parts: { text?: string }[] }[] };
    const prompt = body.contents[0]?.parts[0]?.text ?? "";
    expect(prompt).toMatch(/NEVER: the patient's name, a clinic\/hospital/);
    expect(prompt).toMatch(/set prescriberName to null/);
    expect(prompt).toMatch(/day-first/);
  });

  it("falls back to the next model on quota errors, and fails loudly on other errors", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return calls.length === 1 ? new Response("quota", { status: 429 }) : okResponse({ medications: [] });
    }));
    await expect(new GeminiExtractionProvider("k", "gemini-a").extract({ bytes: Buffer.from("x"), mimeType: "image/png" })).resolves.toEqual({ medications: [] });
    expect(calls).toHaveLength(2);

    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad key", { status: 403 })));
    await expect(new GeminiExtractionProvider("k").extract({ bytes: Buffer.from("x"), mimeType: "image/png" })).rejects.toThrow(/HTTP 403/);
  });
});
