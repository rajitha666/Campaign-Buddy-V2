import { describe, it, expect } from "vitest";
import { formatLkr } from "../src/utils/formatLkr";

describe("formatLkr", () => {
  it("groups thousands", () => {
    expect(formatLkr(1250000)).toBe("Rs 1,250,000");
  });
  it("rounds to whole rupees", () => {
    expect(formatLkr(99.6)).toBe("Rs 100");
  });
  it("keeps the sign in front", () => {
    expect(formatLkr(-4500)).toBe("-Rs 4,500");
  });
});
