import { describe, expect, it } from "vitest";
import { LOGIN_PASSWORD_MAX, loginSchema, PASSWORD_MAX, registerSchema } from "../src/modules/auth/schemas.js";

describe("auth schemas never alter passwords", () => {
  it("keeps inner, leading and trailing spaces exactly", () => {
    const password = "  correct horse battery staple  ";
    expect(registerSchema.parse({ email: "A@Example.com", password }).password).toBe(password);
    expect(loginSchema.parse({ email: "a@example.com", password }).password).toBe(password);
  });

  it("accepts long passwords and Unicode", () => {
    const long = "ab ".repeat(80); // 240 chars with spaces
    expect(registerSchema.safeParse({ email: "a@example.com", password: long }).success).toBe(true);
    expect(registerSchema.safeParse({ email: "a@example.com", password: "पासवर्ड सुरक्षित है 🔐" }).success).toBe(true);
    expect(registerSchema.safeParse({ email: "a@example.com", password: "p".repeat(PASSWORD_MAX) }).success).toBe(true);
  });

  it("bounds registration and login separately", () => {
    expect(registerSchema.safeParse({ email: "a@example.com", password: "p".repeat(PASSWORD_MAX + 1) }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@example.com", password: "p".repeat(PASSWORD_MAX + 1) }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@example.com", password: "p".repeat(LOGIN_PASSWORD_MAX + 1) }).success).toBe(false);
  });

  it("rejects too-short registration passwords", () => {
    expect(registerSchema.safeParse({ email: "a@example.com", password: "short" }).success).toBe(false);
  });

  it("accepts multiword and non-Latin names, trimming only the outer whitespace", () => {
    const r = registerSchema.parse({ email: "a@example.com", password: "long enough pw", fullName: "  अनिल कुमार शर्मा  " });
    expect(r.fullName).toBe("अनिल कुमार शर्मा");
    expect(registerSchema.parse({ email: "a@example.com", password: "long enough pw", fullName: "Mary Anne van der Berg" }).fullName).toBe("Mary Anne van der Berg");
  });
});
