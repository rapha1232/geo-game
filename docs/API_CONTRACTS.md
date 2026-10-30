# API Contracts

The server API is small by design: core gameplay needs no API ([ARCHITECTURE §4](ARCHITECTURE.md#4-system-overview-and-boundaries)). This document specifies (1) the static content interface, (2) the HTTP API under `/api/v1`, and (3) in-process TypeScript interfaces between packages. The examples below are contracts, not implementation.

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api/v1`. A breaking change means `/api/v2`, with v1 kept for 6 months. |
| Format | JSON (`application/json; charset=utf-8`). Field names are `snake_case` on the wire. Server-side zod schemas map them to camelCase types. |
| Auth | R2+: Auth.js session cookie. Endpoints are marked **Public**, **Session** (requires sign-in), or **Editor** (role ≥ editor). |
| CSRF | Mutating Session/Editor endpoints require the `X-Meridian-CSRF` header to match the Auth.js CSRF token. Public mutating endpoints are protected by rate limits plus `Origin` checks. |
| Idempotency | `POST` endpoints that create records accept `Idempotency-Key` (UUID). Repeating a key within 24 h returns the original response. Results are naturally idempotent by result `id`. |
| Pagination | Cursor-based: `?limit=50&cursor=<opaque>`. Response `{items, next_cursor}`. |
| Time | ISO-8601 UTC strings |
| Limits | Body ≤ 64 KB, except `POST /results:batch` ≤ 512 KB |
| Caching | All `/api` responses are `Cache-Control: no-store`, except `GET /challenges/{code}` (`private, max-age=60`) |

## 2. Errors

Errors use RFC 9457 `application/problem+json`:

```json
{
  "type": "https://meridian.example/problems/validation",
  "title": "Invalid request",
  "status": 422,
  "code": "VALIDATION_FAILED",
  "detail": "message must be between 10 and 1000 characters",
  "errors": [{"path": "message", "message": "Too short"}],
  "request_id": "req_01JC9…"
}
```

| HTTP | `code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Malformed JSON |
| 401 | `UNAUTHENTICATED` | Session required |
| 403 | `FORBIDDEN` | Role insufficient, or CSRF/Origin mismatch |
| 404 | `NOT_FOUND` | Unknown resource or challenge code |
| 409 | `CONFLICT` | Stale `seq` on session upload, or an idempotency-key mismatch |
| 410 | `GONE` | Challenge content version expired (the body still includes the payload, so the client can offer "approximately the same") |
| 413 | `PAYLOAD_TOO_LARGE` | Over the limits |
| 422 | `VALIDATION_FAILED` | Schema or plausibility failure |
| 429 | `RATE_LIMITED` | With a `Retry-After` header |
| 500 | `INTERNAL` | Unexpected. Logged with `request_id`. |
| 503 | `UNAVAILABLE` | DB down. The client keeps working offline and retries later. |

Client behavior: a 4xx (other than 429) is never retried automatically. A 429 or 5xx is retried with exponential backoff (2 s, 4 s, 8 s … max 5 min, with jitter).

## 3. Static content interface (CDN)

| Resource | URL | Caching |
|---|---|---|
| Manifest | `GET https://<content-host>/content/manifest.json` | `max-age=300, stale-while-revalidate=86400` |
| Pack | `GET https://<content-host>/content/<version>/<pack>.<hash>.json` | `max-age=31536000, immutable` |
| Release notes | `GET …/content/<version>/RELEASE_NOTES.md` | immutable |

The client validates every pack against its zod schema in development and test builds (in production only the `sha256` is checked, to save CPU).

## 4. HTTP endpoints

### 4.1 Health: Public, R1

`GET /api/v1/health` → `200 {"status":"ok","db":"ok","content_version":"2026.11.0","app_version":"<git sha>"}`. If the DB is down: `503` with `"db":"down"`.

### 4.2 Challenges: Public, R1

**Create a short code**

`POST /api/v1/challenges`
```json
{"game_id": "silhouette", "payload": "eJyrVkpUslJKVKoFAA…", "content_version": "2026.11.0"}
```
→ `201`
```json
{"code": "SH-4KQ2-M9XD", "url": "https://meridian.example/c/SH-4KQ2-M9XD"}
```
Validation: the `payload` decodes (§8.4 of ARCHITECTURE) to a valid config for `game_id`, and `content_version` matches the payload's `cv`. An identical payload returns the existing code (dedupe by payload hash). Rate limit: 30/min/IP.

**Resolve**

`GET /api/v1/challenges/SH-4KQ2-M9XD` → `200 {"game_id":"silhouette","payload":"…","content_version":"2026.11.0"}` (increments `uses` and sets `last_used_at`). Codes are case-insensitive and dash-insensitive. If the version has expired: `410` with the same body.

The page route `/c/[code]` handles both long codes (decoded client-side) and short codes (resolved via this endpoint).

### 4.3 Reports: Public, R1

`POST /api/v1/reports`
```json
{
  "category": "answer_rejected",
  "message": "Typing 'Cabo Verde' should be accepted for Cape Verde.",
  "target_ref": "country:CPV",
  "context": {"game_id": "quiz", "quiz_slug": "countries-of-the-world", "seed": "K7Q2M9XD1A", "input": "cabo verde", "content_version": "2026.11.0"},
  "reporter_email": "optional@example.com"
}
```
→ `202 {"id": "6f1c…", "status": "new"}`

Rules: `category` enum per [DATA_MODEL §3.3](DATA_MODEL.md#33-platform-r1). `message` is 10–1,000 characters. `context` is ≤ 4 KB. `reporter_email` is optional and RFC 5322-validated. Rate limit: 10/min/IP and 50/day/IP. If signed in, `user_id` is attached.

### 4.4 Current user: Session, R2

- `GET /api/v1/me` → `200 {"id":"…","email":"…","display_name":null,"role":"player","created_at":"…"}`, or `401`.
- `GET /api/v1/me/settings` → `200 {"settings": {…}, "updated_at": "…"}`.
- `PUT /api/v1/me/settings` with body `{"settings": {…}, "updated_at": "<client's last known>"}` → `200`. If the server copy is newer than `updated_at`: `409 CONFLICT` with the server copy, and the client asks the player which to keep.

### 4.5 Results: Session, R2

**Upload (batch)**

`POST /api/v1/results:batch`
```json
{"results": [ { "id": "01JC8Z5V6R2Q8T3X9K4M7N1P0A", "game_id": "silhouette", "…": "GameResult per DATA_MODEL §2.9" } ]}
```
→ `200`
```json
{"accepted": ["01JC8Z5V6R2Q8T3X9K4M7N1P0A"], "duplicates": [], "rejected": [{"id": "01J…", "code": "IMPLAUSIBLE", "detail": "score > max_score"}], "personal_bests_updated": ["quiz|world|TYPE_ALL|sovereign-197|all|timed"]}
```
Up to 50 results per call. Each result is validated independently: schema, `score ≤ max_score`, `ended_at ≥ started_at`, `active_ms ≤ (ended_at − started_at) + 60 s`, `content_version` is known, and `ended_at` is not more than 5 minutes in the future. Rejected results are dropped from the client queue and logged locally.

**List**

`GET /api/v1/results?game_id=silhouette&limit=50&cursor=…` → `200 {"items":[summary…], "next_cursor": "…"}` (summary = result without `items`, `meta` or `event_log`).

`GET /api/v1/results/{id}` → the full result.

**Personal bests**

`GET /api/v1/me/personal-bests` → `200 {"items":[{"pb_key":"…","score":0.87,"active_ms":722000,"result_id":"…"}]}`.

### 4.6 Anonymous answer telemetry (R2)

**Public** (no session is required, and the session is ignored even if present).

`POST /api/v1/telemetry/answers`
```json
{"session_hash": "c2f1…(random 128-bit, per play session)", "content_version": "2026.11.0",
 "events": [{"game_id":"deep-cut","item_kind":"prompt_answer","item_id":"country:TLS","prompt_id":"prompt:lang-portuguese","correct":true,"attempt":1,"difficulty_setting":"normal","t":"2026-11-05T08:03:11Z"}]}
```
→ `204`. ≤ 100 events per call. Sent only if telemetry is enabled in Settings. Batched every 30 s and on `pagehide` via `navigator.sendBeacon`. No IP is stored (the edge handler strips it before logging).

### 4.7 Progress sync: Session, R2

`POST /api/v1/sync`
```json
{
  "since": "2026-11-01T00:00:00Z",
  "mastery":   [{"entity_id":"country:TUV","skill":"locate","mastery":0.41,"exposures":5,"last_seen_at":"…","due_at":"…"}],
  "history":   [{"game_id":"silhouette","pool_key":"sovereign-197","target_ids":["country:FRA","…"],"updated_at":"…"}],
  "seen":      [{"kind":"fact","item_id":"fact:0142","first_seen_at":"…"}],
  "favorites": {"upserts":["quiz:countries-of-the-world"],"deletes":["game:rank-it"]},
  "achievements":[{"achievement_id":"ACH-SH-50","unlocked_at":"…"}],
  "streak": {"enabled": true, "current": 4, "best": 9, "last_active_date": "2026-11-05", "freezes_available": 2}
}
```
→ `200` with the same structure containing **server-side changes since `since`**, after applying the merge semantics in [DATA_MODEL §3.2](DATA_MODEL.md#32-progress-r2), plus `"server_time"`. The client stores `server_time` as its next `since`.

### 4.8 Active sessions (untimed cross-device resume): Session, R2

- `PUT /api/v1/me/sessions/{game_id}` with `{"seq": 17, "session": {…}}` → `200`. If the server's `seq` is ≥ the request's: `409` with the server copy.
- `GET /api/v1/me/sessions` → `200 {"items":[{"game_id":"quiz","seq":17,"updated_at":"…","summary":"Capitals of Europe · 21/45"}]}`.
- `DELETE /api/v1/me/sessions/{game_id}` → `204`.

### 4.9 Account data: Session, R2

- `GET /api/v1/me/export` → `200`, a JSON attachment containing every user-owned row.
- `DELETE /api/v1/me` with body `{"confirm": "DELETE"}` → `202`. Sessions are revoked immediately, and the hard delete runs within 24 h.

### 4.10 Admin: Editor, R3

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/admin/reports?status=new&severity=S1&cursor=…` | Queue |
| PATCH | `/api/v1/admin/reports/{id}` | `{status, severity, duplicate_of?, resolution_note?, assigned_to?}` |
| POST | `/api/v1/admin/reports/{id}/pr` | Create a content PR branch from an edit payload `{files: [{path, content}]}` via the GitHub App. Returns `{pr_url}`. |
| GET/POST | `/api/v1/admin/rulings` | List / create rulings |
| GET | `/api/v1/admin/calibration?item_kind=…` | Inspect calibration stats |

All admin mutations write `admin_audit_log`.

## 5. In-process interfaces (package boundaries)

```ts
// packages/game-kit
export type Seed = string;                               // 10-char Crockford base32
export interface Rng { nextUint32(): number; nextFloat(): number; int(maxExclusive: number): number;
  pick<T>(xs: readonly T[]): T; shuffle<T>(xs: readonly T[]): T[]; fork(label: string): Rng; }
export function createRng(seed: Seed, gameId: string, configHash: string): Rng;
export function newSeed(): Seed;

export interface RepeatGuard {
  select<T extends { id: string }>(pool: readonly T[], history: readonly string[], rules: RepeatRules, rng: Rng,
    count: number): { picked: T[]; relaxed: boolean };
}

export interface Timer { elapsedMs: number; runningSince: number | null; limitMs: number | null }
export function startTimer(t: Timer, now: number): Timer;
export function pauseTimer(t: Timer, now: number): Timer;
export function remainingMs(t: Timer, now: number): number | null;

export function encodeChallenge(p: ChallengePayload): string;      // long code
export function decodeChallenge(code: string): ChallengePayload;   // throws ChallengeDecodeError

// packages/name-matcher
export function norm(input: string): string;
export interface MatcherIndex { /* built once per session */ }
export function buildIndex(entities: readonly EntityNames[], ambiguity: readonly AmbiguityGroup[],
  opts: { languages: string[]; allowCodes: boolean }): MatcherIndex;
export type MatchResult =
  | { kind: "accept"; entityId: string; via: "exact" | "fuzzy" | "ambiguity-resolved"; aliasKind: AliasKind; distance?: number }
  | { kind: "hold"; entityId: string }                               // prefix-hold
  | { kind: "already"; entityId: string }
  | { kind: "ambiguous"; group: string; message: string }
  | { kind: "out-of-scope"; entityId: string; reason: string }
  | { kind: "wrong"; entityId: string }
  | { kind: "none" };
export function matchKeystroke(ix: MatcherIndex, input: string, ctx: MatchContext): MatchResult;
export function matchSubmit(ix: MatcherIndex, input: string, ctx: MatchContext,
  strictness: "lenient" | "standard" | "strict"): MatchResult;
export type MatchContext = { remaining: ReadonlySet<string>; named: ReadonlySet<string>;
  inScope: ReadonlySet<string>; expected?: ReadonlySet<string> /* TYPE_PROMPTED */ };

// packages/geo
export function haversineKm(a: LatLon, b: LatLon): number;           // R = 6371.0088
export function rhumbBearingDeg(from: LatLon, to: LatLon): number;   // [0, 360)
export function sector8(bearingDeg: number): "N"|"NE"|"E"|"SE"|"S"|"SW"|"W"|"NW";
export function proximityPct(km: number): number;                    // floor(100*(1-km/20015.1)), clamp [0,99]
export function pointInEntity(p: LatLon, geom: Polygonal): boolean;  // antimeridian-aware
export function distanceToEntityKm(p: LatLon, geom: Polygonal): number; // 0 if inside

// apps/web content loader
export interface ContentLoader {
  manifest(): Promise<Manifest>;
  load<K extends PackName>(name: K, version?: string): Promise<PackType<K>>;  // cached, sha256-verified
}
```

**Error types:** `ChallengeDecodeError` (`reason ∈ {"length","base64","inflate","schema","version"}`), `PackLoadError` (`{pack, version, cause: "network"|"hash"|"schema"|"expired"}`). The UI maps these to the copy in [UX_AND_DESIGN §8](UX_AND_DESIGN.md#8-system-states-loading-empty-error-offline-interrupted).
