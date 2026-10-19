import { describe, expect, it } from "vitest";
import { z } from "zod";

const reviewSchema = z.strictObject({
  rating: z.coerce.number().int().min(1).max(5),
  reviewText: z.string().max(500).optional(),
});

describe("hospital review validation", () => {
  it("accepts valid 1 to 5 star ratings with optional comments", () => {
    for (const rating of [1, 2, 3, 4, 5]) {
      const parsed = reviewSchema.parse({ rating, reviewText: "Clean and polite doctors." });
      expect(parsed.rating).toBe(rating);
      expect(parsed.reviewText).toBe("Clean and polite doctors.");
    }

    const withoutText = reviewSchema.parse({ rating: 4 });
    expect(withoutText.rating).toBe(4);
    expect(withoutText.reviewText).toBeUndefined();
  });

  it("coerces string ratings to integers within range", () => {
    const parsed = reviewSchema.parse({ rating: "5" });
    expect(parsed.rating).toBe(5);
  });

  it("rejects invalid ratings < 1 or > 5 or non-integers", () => {
    expect(() => reviewSchema.parse({ rating: 0 })).toThrow();
    expect(() => reviewSchema.parse({ rating: 6 })).toThrow();
    expect(() => reviewSchema.parse({ rating: -1 })).toThrow();
    expect(() => reviewSchema.parse({ rating: 3.5 })).toThrow();
    expect(() => reviewSchema.parse({ rating: "excellent" })).toThrow();
  });

  it("rejects reviewText longer than 500 characters", () => {
    expect(() => reviewSchema.parse({ rating: 5, reviewText: "a".repeat(501) })).toThrow();
    expect(reviewSchema.parse({ rating: 5, reviewText: "a".repeat(500) }).reviewText?.length).toBe(500);
  });
});
