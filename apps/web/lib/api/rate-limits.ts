/**
 * Rate limits (ARCHITECTURE §12). Enforced by Vercel WAF rules, which are configured in the Vercel project
 * (Firewall → Custom rules), not in code. This table is the source of truth for those rules.
 */
export const RATE_LIMITS = [
  { path: "/api/v1/reports", limit: 10, windowSeconds: 60, perIp: true },
  { path: "/api/v1/reports", limit: 50, windowSeconds: 86_400, perIp: true },
  { path: "/api/v1/challenges", limit: 30, windowSeconds: 60, perIp: true },
  { path: "/api/v1/telemetry", limit: 120, windowSeconds: 60, perIp: true },
  { path: "/api/auth", limit: 10, windowSeconds: 60, perIp: true },
] as const;
