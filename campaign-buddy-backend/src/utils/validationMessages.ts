import { z } from "zod";

// One consistent set of user-facing validation messages for every endpoint.
//
// Zod's stock text ("Too small: expected string to have >=1 characters",
// "Invalid option: expected one of ...") leaks library-internal wording to
// portal users. This global error map rewrites the common issue codes into
// plain sentences that name the offending field — see issue #4.
//
// Precedence: an explicit per-schema message still wins (e.g.
// `z.string().regex(re, "must be a YYYY-MM-DD or ISO date")`), so schemas that
// already say something friendly are untouched. This only fills the gaps.

/** "campaignItemId" / "from_date" / ["items", 0, "qty"] -> "Qty" */
function fieldLabel(path: ReadonlyArray<PropertyKey>): string {
  const seg = path.length ? String(path[path.length - 1]) : "";
  if (!seg || /^\d+$/.test(seg)) return "This value";
  const words = seg
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const TYPE_LABEL: Record<string, string> = {
  string: "text",
  number: "a number",
  int: "a whole number",
  bigint: "a whole number",
  boolean: "true or false",
  date: "a date",
  array: "a list",
  object: "a set of fields",
};

const FORMAT_LABEL: Record<string, string> = {
  email: "a valid email address",
  url: "a valid URL",
  uuid: "a valid ID",
  datetime: "a valid date/time",
  date: "a valid date",
};

export function friendlyValidationMessage(issue: z.core.$ZodRawIssue): string | undefined {
  const label = fieldLabel(issue.path ?? []);

  switch (issue.code) {
    case "invalid_type":
      if (issue.input === undefined || issue.input === null) return `${label} is required`;
      return `${label} must be ${TYPE_LABEL[String(issue.expected)] ?? String(issue.expected)}`;

    case "too_small": {
      const min = Number(issue.minimum);
      if (issue.origin === "string")
        return min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`;
      if (issue.origin === "array")
        return min <= 1 ? `${label} needs at least one entry` : `${label} needs at least ${min} entries`;
      return `${label} must be ${min} or more`;
    }

    case "too_big": {
      const max = Number(issue.maximum);
      if (issue.origin === "string") return `${label} must be ${max} characters or fewer`;
      if (issue.origin === "array") return `${label} allows at most ${max} entries`;
      return `${label} must be ${max} or less`;
    }

    case "invalid_format":
      return `${label} must be ${FORMAT_LABEL[String(issue.format)] ?? "in the expected format"}`;

    case "invalid_value":
      return `${label} must be one of the allowed options`;

    case "not_multiple_of":
      return `${label} must be a multiple of ${issue.divisor}`;

    case "unrecognized_keys":
      return "The request contains fields that aren't allowed here";

    default:
      // "custom" (.refine), "invalid_union", etc. — keep whatever the schema said.
      return undefined;
  }
}

let installed = false;

/** Register the friendly message map globally. Safe to call more than once. */
export function installValidationMessages(): void {
  if (installed) return;
  installed = true;
  z.config({ customError: (issue) => friendlyValidationMessage(issue) });
}
