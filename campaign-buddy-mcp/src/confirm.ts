import { createHash, randomBytes } from "node:crypto";

// Two-step writes. A write tool first returns a preview + one-time token; only a
// second call with the identical arguments and that token executes it. This makes
// every mutation explicit and reviewable. The token alone is NOT a security
// boundary (a model can see it) — the boundary is the human approval the host
// (Claude Desktop, or our intelligence client) puts in front of write tools.

const TTL_MS = 5 * 60_000;

function fingerprint(tool: string, args: unknown) {
  const stable = JSON.stringify(args, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)))
      : v);
  return createHash("sha256").update(tool).update(stable).digest("hex");
}

export class ConfirmationStore {
  private pending = new Map<string, { fp: string; expires: number }>();

  issue(tool: string, args: unknown): { token: string; expiresInSeconds: number } {
    this.sweep();
    const token = randomBytes(9).toString("base64url");
    this.pending.set(token, { fp: fingerprint(tool, args), expires: Date.now() + TTL_MS });
    return { token, expiresInSeconds: TTL_MS / 1000 };
  }

  /** Single use: a token is consumed whether or not it matches. */
  consume(token: string, tool: string, args: unknown): boolean {
    const entry = this.pending.get(token);
    this.pending.delete(token);
    return !!entry && entry.expires > Date.now() && entry.fp === fingerprint(tool, args);
  }

  private sweep() {
    const now = Date.now();
    for (const [t, e] of this.pending) if (e.expires <= now) this.pending.delete(t);
  }
}
