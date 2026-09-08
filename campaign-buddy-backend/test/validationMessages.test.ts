import { describe, expect, it } from "vitest";
import { z } from "zod";
import { friendlyValidationMessage, installValidationMessages } from "../src/utils/validationMessages";

// app.ts installs this globally at boot; do the same here so safeParse in this
// file produces the same messages the routes return.
installValidationMessages();
function messagesFor(schema: z.ZodType, value: unknown): Record<string, string> {
  const r = schema.safeParse(value);
  if (r.success) return {};
  return Object.fromEntries(r.error.issues.map((i) => [i.path.join(".") || "_", i.message]));
}

describe("friendly validation messages", () => {
  it("names a missing required field instead of 'expected string, received undefined'", () => {
    const s = z.object({ username: z.string().min(1), password: z.string().min(1) });
    expect(messagesFor(s, {})).toEqual({
      username: "Username is required",
      password: "Password is required",
    });
  });

  it("humanizes camelCase field names", () => {
    const s = z.object({ fromDate: z.string().min(1), campaignItemId: z.string().min(1) });
    expect(messagesFor(s, { fromDate: "", campaignItemId: "" })).toEqual({
      fromDate: "From date is required",
      campaignItemId: "Campaign item id is required",
    });
  });

  it("explains numeric bounds in plain words", () => {
    const s = z.object({ footFall: z.number().int().min(0), pct: z.number().max(100) });
    expect(messagesFor(s, { footFall: -1, pct: 200 })).toEqual({
      footFall: "Foot fall must be 0 or more",
      pct: "Pct must be 100 or less",
    });
  });

  it("explains string length bounds", () => {
    const s = z.object({ note: z.string().max(3) });
    expect(messagesFor(s, { note: "abcd" })).toEqual({ note: "Note must be 3 characters or fewer" });
  });

  it("replaces the enum 'Invalid option' text", () => {
    const s = z.object({ reason: z.enum(["sick_leave", "annual_leave"]) });
    expect(messagesFor(s, { reason: "nope" })).toEqual({
      reason: "Reason must be one of the allowed options",
    });
  });

  it("keeps an explicit per-schema message", () => {
    const s = z.object({ d: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "must be a YYYY-MM-DD or ISO date") });
    expect(messagesFor(s, { d: "nope" })).toEqual({ d: "must be a YYYY-MM-DD or ISO date" });
  });

  it("leaves .refine/custom issues alone", () => {
    expect(friendlyValidationMessage({ code: "custom", path: ["x"], input: 1, message: "boom" } as never)).toBeUndefined();
  });
});
