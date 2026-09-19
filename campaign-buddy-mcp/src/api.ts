// Thin typed wrapper over the Campaign Buddy /admin/v1 API. The MCP server never
// touches the database: every read and write goes through the same routes the
// portal uses, so role + CampaignAccessGrant rules are enforced by the backend.

export class CbApiError extends Error {
  constructor(public status: number, public code: string, message: string, public field?: string) {
    super(message);
  }
}

export interface Session {
  accessToken: string;
  user: { id: string; displayName: string; roleId: string; defaultUrl?: string };
  expiresAt: number; // epoch ms
}

type Query = Record<string, string | number | boolean | undefined | null>;
export type FetchLike = typeof fetch;

export interface ApiEnvelope<T = unknown> {
  data: T;
  meta?: { total?: number; grandTotal?: number };
}

function jwtExpiryMs(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    if (typeof payload.exp === "number") return payload.exp * 1000;
  } catch { /* fall through */ }
  return Date.now() + 5 * 60_000;
}

export class CampaignBuddyApi {
  private session?: Session;
  private loginInFlight?: Promise<Session>;

  constructor(
    private baseUrl: string,
    private creds: { username: string; password: string },
    private fetchImpl: FetchLike = fetch,
  ) {}

  private url(path: string, query?: Query) {
    const u = new URL(`${this.baseUrl}/admin/v1${path}`);
    for (const [k, v] of Object.entries(query ?? {})) {
      if (v !== undefined && v !== null && v !== "") u.searchParams.set(k, String(v));
    }
    return u;
  }

  private async parse(res: Response) {
    if (res.status === 204) return { data: null } as ApiEnvelope<null>;
    const text = await res.text();
    let body: any;
    try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
    if (!res.ok) {
      const err = body?.error ?? {};
      throw new CbApiError(res.status, err.code ?? `HTTP_${res.status}`, err.message ?? `Request failed (${res.status})`, err.field);
    }
    return body as ApiEnvelope;
  }

  async login(): Promise<Session> {
    // Coalesce concurrent logins so parallel tool calls don't stampede /auth/login.
    this.loginInFlight ??= (async () => {
      const res = await this.fetchImpl(this.url("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.creds),
      });
      const body = (await this.parse(res)) as ApiEnvelope<{ accessToken: string; user: Session["user"] }>;
      this.session = {
        accessToken: body.data.accessToken,
        user: body.data.user,
        expiresAt: jwtExpiryMs(body.data.accessToken),
      };
      return this.session;
    })().finally(() => { this.loginInFlight = undefined; });
    return this.loginInFlight;
  }

  async whoami(): Promise<Session["user"]> {
    return (await this.ensureSession()).user;
  }

  private async ensureSession(): Promise<Session> {
    // Refresh a minute early — the backend issues no refresh tokens (re-login on expiry).
    if (this.session && this.session.expiresAt - 60_000 > Date.now()) return this.session;
    return this.login();
  }

  async request(method: string, path: string, opts: { query?: Query; body?: unknown } = {}): Promise<ApiEnvelope> {
    for (let attempt = 0; ; attempt++) {
      const session = attempt === 0 ? await this.ensureSession() : await this.login();
      const res = await this.fetchImpl(this.url(path, opts.query), {
        method,
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      });
      if (res.status === 401 && attempt === 0) continue; // token expired/revoked — one re-login retry
      return this.parse(res);
    }
  }

  get = (path: string, query?: Query) => this.request("GET", path, { query });
  post = (path: string, body?: unknown) => this.request("POST", path, { body });
  patch = (path: string, body?: unknown) => this.request("PATCH", path, { body });
  put = (path: string, body?: unknown) => this.request("PUT", path, { body });
}
