/** Content-Security-Policy (ARCHITECTURE §12, AC-PL-025). Built per request with a fresh nonce. */
export type CspOptions = {
  nonce: string;
  /** `next dev` needs `unsafe-eval` for React's debugging features. Never set in production. */
  dev?: boolean;
  /** Origin of the content-pack host (Vercel Blob). Falls back to self. */
  contentHost?: string | undefined;
  /** Extra origins for `connect-src`, e.g. analytics and error reporting. */
  extraConnect?: readonly string[];
  /** Extra origins for `script-src`, e.g. the analytics script. */
  extraScript?: readonly string[];
};

export function buildCsp({
  nonce,
  dev = false,
  contentHost,
  extraConnect = [],
  extraScript = [],
}: CspOptions): string {
  const content = contentHost ? [contentHost] : [];
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // 'strict-dynamic' lets nonced scripts load the chunks they need without listing each file.
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...extraScript,
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // React Aria injects one small nonced <style> (touch-action) and finds the nonce in <meta name="csp-nonce">.
    "style-src": ["'self'", `'nonce-${nonce}'`],
    // Components set inline style attributes (positioning, CSS variables); styles never come from inline <style>.
    "style-src-attr": ["'unsafe-inline'"],
    "img-src": ["'self'", "data:", ...content],
    "font-src": ["'self'"],
    "connect-src": [
      "'self'",
      ...content,
      ...extraConnect,
      ...(dev ? ["ws:", "http://localhost:*"] : []),
    ],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  const policy = Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
  return dev ? policy : `${policy}; upgrade-insecure-requests`;
}

export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
