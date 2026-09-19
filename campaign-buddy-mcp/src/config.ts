export interface Config {
  apiBaseUrl: string;
  username: string;
  password: string;
  readOnly: boolean;
  http: { port: number; host: string; token: string };
}

const flag = (v: string | undefined) => v === "1" || v?.toLowerCase() === "true";

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    apiBaseUrl: (env.CB_API_BASE_URL || "http://localhost:4000").replace(/\/+$/, ""),
    username: env.CB_USERNAME || "",
    password: env.CB_PASSWORD || "",
    readOnly: flag(env.CB_MCP_READ_ONLY),
    http: {
      port: Number(env.CB_MCP_HTTP_PORT || 4300),
      host: env.CB_MCP_HTTP_HOST || "127.0.0.1",
      token: env.CB_MCP_HTTP_TOKEN || "",
    },
  };
}

export function requireCredentials(cfg: Config) {
  if (!cfg.username || !cfg.password) {
    throw new Error("CB_USERNAME and CB_PASSWORD must be set — the MCP server acts as this portal user.");
  }
}
