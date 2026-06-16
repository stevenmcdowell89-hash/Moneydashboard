// ============================================================================
// Cloudflare Access JWT verification.
//
// Every API request must present a valid Cloudflare Access JWT. The token is
// supplied in the `Cf-Access-Jwt-Assertion` header (Access injects it on every
// proxied request) and, as a fallback, in the `CF_Authorization` cookie.
//
// We verify the RS256 signature using WebCrypto against the team's public JWKS
// (`https://<team>/cdn-cgi/access/certs`), then check `aud`, `iss` and `exp`.
//
// A dev bypass exists ONLY when env.DEV_BYPASS_AUTH === "true" AND the Access
// vars are unset/placeholder — never in production.
// ============================================================================

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  DEV_BYPASS_AUTH?: string;
  GOCARDLESS_SECRET_ID?: string;
  GOCARDLESS_SECRET_KEY?: string;
}

interface Jwk {
  kid: string;
  kty: string;
  alg?: string;
  use?: string;
  n: string;
  e: string;
}

interface Certs {
  keys: Jwk[];
}

interface JwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

interface JwtPayload {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  sub?: string;
  email?: string;
}

// ---------------------------------------------------------------------------
// In-memory caches (per-isolate). The JWKS is small and rotates infrequently.
// ---------------------------------------------------------------------------
const KEY_CACHE = new Map<string, CryptoKey>(); // kid -> imported public key
let certsFetchedAt = 0;
let certsTeamDomain = '';
const CERTS_TTL_MS = 60 * 60 * 1000; // 1 hour

function isPlaceholder(v: string | undefined): boolean {
  return !v || v.startsWith('REPLACE_WITH') || v.trim() === '';
}

// base64url -> Uint8Array (correct padding + url-safe alphabet handling).
function base64UrlToBytes(input: string): Uint8Array {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad === 2) b64 += '==';
  else if (pad === 3) b64 += '=';
  else if (pad === 1) throw new Error('Invalid base64url string');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function base64UrlToString(input: string): string {
  return new TextDecoder().decode(base64UrlToBytes(input));
}

function teamDomainUrl(env: Env): string {
  let domain = (env.CF_ACCESS_TEAM_DOMAIN || '').trim();
  if (!domain.startsWith('http')) domain = `https://${domain}`;
  return domain.replace(/\/$/, '');
}

async function fetchCerts(env: Env): Promise<void> {
  const base = teamDomainUrl(env);
  const url = `${base}/cdn-cgi/access/certs`;
  const res = await fetch(url, { cf: { cacheTtl: 3600 } } as RequestInit);
  if (!res.ok) {
    throw new Error(`Failed to fetch Access certs (${res.status})`);
  }
  const certs = (await res.json()) as Certs;
  KEY_CACHE.clear();
  for (const jwk of certs.keys) {
    const key = await crypto.subtle.importKey(
      'jwk',
      {
        kty: jwk.kty,
        n: jwk.n,
        e: jwk.e,
        alg: 'RS256',
        ext: true,
      },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    KEY_CACHE.set(jwk.kid, key);
  }
  certsFetchedAt = Date.now();
  certsTeamDomain = base;
}

async function getKey(kid: string, env: Env): Promise<CryptoKey | undefined> {
  const base = teamDomainUrl(env);
  const stale = Date.now() - certsFetchedAt > CERTS_TTL_MS;
  if (KEY_CACHE.size === 0 || stale || certsTeamDomain !== base) {
    await fetchCerts(env);
  }
  let key = KEY_CACHE.get(kid);
  if (!key) {
    // kid not found — keys may have rotated; force one refresh.
    await fetchCerts(env);
    key = KEY_CACHE.get(kid);
  }
  return key;
}

// Read the JWT from header first, then the CF_Authorization cookie.
function extractToken(request: Request): string | null {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie');
  if (cookie) {
    const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

/**
 * Verify a Cloudflare Access JWT on the incoming request.
 * Returns true when valid; returns false (never throws on auth failure) so
 * callers can map cleanly to a 401.
 */
export async function verifyAccess(request: Request, env: Env): Promise<boolean> {
  // Dev bypass: only when explicitly enabled AND Access is not configured.
  if (
    env.DEV_BYPASS_AUTH === 'true' &&
    (isPlaceholder(env.CF_ACCESS_TEAM_DOMAIN) || isPlaceholder(env.CF_ACCESS_AUD))
  ) {
    return true;
  }

  if (isPlaceholder(env.CF_ACCESS_TEAM_DOMAIN) || isPlaceholder(env.CF_ACCESS_AUD)) {
    // Access not configured and no dev bypass -> reject.
    return false;
  }

  const token = extractToken(request);
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: JwtHeader;
  let payload: JwtPayload;
  try {
    header = JSON.parse(base64UrlToString(headerB64)) as JwtHeader;
    payload = JSON.parse(base64UrlToString(payloadB64)) as JwtPayload;
  } catch {
    return false;
  }

  if (header.alg !== 'RS256' || !header.kid) return false;

  // Verify signature over `${header}.${payload}`.
  let key: CryptoKey | undefined;
  try {
    key = await getKey(header.kid, env);
  } catch {
    return false;
  }
  if (!key) return false;

  let signature: Uint8Array;
  try {
    signature = base64UrlToBytes(signatureB64);
  } catch {
    return false;
  }
  const signed = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

  let valid: boolean;
  try {
    valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      key,
      signature as unknown as BufferSource,
      signed as unknown as BufferSource,
    );
  } catch {
    return false;
  }
  if (!valid) return false;

  // Claims.
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && now >= payload.exp) return false;
  if (typeof payload.nbf === 'number' && now < payload.nbf) return false;

  // iss must match the team domain.
  const expectedIss = teamDomainUrl(env);
  if (!payload.iss || payload.iss.replace(/\/$/, '') !== expectedIss) return false;

  // aud must include our application AUD tag.
  const aud = payload.aud;
  const expectedAud = (env.CF_ACCESS_AUD || '').trim();
  const audList = Array.isArray(aud) ? aud : aud ? [aud] : [];
  if (!audList.includes(expectedAud)) return false;

  return true;
}
