import { describe, expect, it } from "vitest";
import { normalizeLkPhone, looksLikePhone } from "../src/utils/phone";

describe("normalizeLkPhone", () => {
  it("canonicalizes the common Sri Lankan formats to E.164", () => {
    expect(normalizeLkPhone("0771234567")).toBe("+94771234567");
    expect(normalizeLkPhone("771234567")).toBe("+94771234567");
    expect(normalizeLkPhone("94771234567")).toBe("+94771234567");
    expect(normalizeLkPhone("+94771234567")).toBe("+94771234567");
  });

  it("ignores spaces, dashes and parens", () => {
    expect(normalizeLkPhone("077 123 4567")).toBe("+94771234567");
    expect(normalizeLkPhone("+94 77-123-4567")).toBe("+94771234567");
  });

  it("returns null for things that aren't phone numbers", () => {
    expect(normalizeLkPhone("sktest")).toBeNull();
    expect(normalizeLkPhone("")).toBeNull();
    expect(normalizeLkPhone(null)).toBeNull();
    expect(normalizeLkPhone("12345")).toBeNull();
  });

  it("keeps other-country E.164 numbers as-is", () => {
    expect(normalizeLkPhone("+14155552671")).toBe("+14155552671");
  });

  it("looksLikePhone mirrors normalize", () => {
    expect(looksLikePhone("0771234567")).toBe(true);
    expect(looksLikePhone("sktest")).toBe(false);
  });
});
