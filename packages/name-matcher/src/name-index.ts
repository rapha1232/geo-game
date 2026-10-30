import { boundedDistance } from "./distance";
import { hasOnlyNonLatinLetters, norm } from "./norm";
import {
  HOLD_MS,
  type AcceptNote,
  type AliasKind,
  type AmbiguityGroup,
  type MatchContext,
  type MatchEntity,
  type MatchResult,
  type Strictness,
} from "./types";

type Entry = { entityId: string; key: string; text: string; kind: AliasKind };

/** Preference when several aliases of one entity share a key. */
const KIND_PRIORITY: Record<AliasKind, number> = {
  canonical: 0,
  official: 1,
  common: 2,
  ascii: 3,
  endonym: 4,
  former: 5,
  code: 6,
};

/** Fuzzy threshold by alias key length (quiz-library §5.1). */
export function fuzzyThreshold(keyLength: number, strictness: Strictness): number {
  if (strictness === "strict" || keyLength <= 4) return 0;
  if (keyLength <= 7) return strictness === "lenient" || strictness === "standard" ? 1 : 0;
  if (keyLength <= 12) return strictness === "lenient" ? 3 : 2;
  return strictness === "lenient" ? 4 : 3;
}

const maxThreshold = (s: Strictness): number => (s === "lenient" ? 4 : s === "standard" ? 3 : 0);

export class NameIndex {
  /** Keys shared by several entities with no declared ambiguity group (for the content validator). */
  readonly collisions: { key: string; entityIds: string[] }[] = [];

  private readonly entities = new Map<string, MatchEntity>();
  private readonly exact = new Map<string, Entry[]>();
  private readonly groups = new Map<string, AmbiguityGroup>();
  private readonly byLength = new Map<number, Entry[]>();
  /** key → entity ids whose alias keys strictly extend `key` (for prefix-hold). */
  private readonly longer = new Map<string, Set<string>>();

  constructor(entities: readonly MatchEntity[], groups: readonly AmbiguityGroup[] = []) {
    for (const e of entities) {
      this.entities.set(e.id, e);
      const best = new Map<string, Entry>();
      const all = [{ text: e.name, kind: "canonical" as AliasKind }, ...e.aliases];
      for (const a of all) {
        const key = norm(a.text);
        if (key === "") continue;
        const cur = best.get(key);
        if (!cur || KIND_PRIORITY[a.kind] < KIND_PRIORITY[cur.kind]) {
          best.set(key, { entityId: e.id, key, text: a.text, kind: a.kind });
        }
      }
      for (const entry of best.values()) {
        const list = this.exact.get(entry.key) ?? [];
        list.push(entry);
        this.exact.set(entry.key, list);
        const bucket = this.byLength.get(entry.key.length) ?? [];
        bucket.push(entry);
        this.byLength.set(entry.key.length, bucket);
      }
    }
    for (const g of groups) this.groups.set(norm(g.alias), g);
    for (const [key, list] of this.exact) {
      const ids = [...new Set(list.map((x) => x.entityId))];
      if (ids.length > 1 && !this.groups.has(key)) this.collisions.push({ key, entityIds: ids });
    }
    const keys = [...this.exact.keys()]
      .filter((k) => this.exact.get(k)?.some((x) => x.kind !== "code"))
      .sort();
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i] as string;
      for (let j = i + 1; j < keys.length && (keys[j] as string).startsWith(k); j++) {
        const set = this.longer.get(k) ?? new Set<string>();
        for (const x of this.exact.get(keys[j] as string) ?? [])
          if (x.kind !== "code") set.add(x.entityId);
        this.longer.set(k, set);
      }
    }
  }

  /**
   * Decision procedure of quiz-library §5.1. With `submitted: false` (a keystroke) only exact matching runs and
   * prefix-hold may be returned. With `submitted: true` (Enter) fuzzy matching runs when nothing matched exactly.
   */
  match(input: string, ctx: MatchContext, opts: { submitted: boolean }): MatchResult {
    const key = norm(input);
    if (key === "")
      return hasOnlyNonLatinLetters(input) ? { kind: "try-english" } : { kind: "ignore" };
    const exact = this.matchExact(key, ctx, opts.submitted);
    if (exact) return exact;
    if (!opts.submitted) return { kind: "not-recognized" };
    return this.matchFuzzy(key, ctx) ?? { kind: "not-recognized" };
  }

  private entries(key: string, ctx: MatchContext): Entry[] {
    const codesOn =
      ctx.enableCodes === true && ctx.mode === "type_all" && ctx.strictness === "lenient";
    return (this.exact.get(key) ?? []).filter((e) => e.kind !== "code" || codesOn);
  }

  private matchExact(key: string, ctx: MatchContext, submitted: boolean): MatchResult | null {
    const group = this.groups.get(key);
    if (group)
      return this.resolveGroup(group.group, group.message, [...group.members], ctx, submitted);
    const list = this.entries(key, ctx);
    if (list.length === 0) return null;
    const ids = [...new Set(list.map((x) => x.entityId))];
    if (ids.length > 1) {
      return this.resolveGroup(
        `collision:${key}`,
        "That name matches more than one answer. Be more specific.",
        ids,
        ctx,
        submitted,
        key,
      );
    }
    return this.resolveEntity(list[0] as Entry, ctx, submitted);
  }

  private resolveGroup(
    group: string,
    message: string,
    members: string[],
    ctx: MatchContext,
    submitted: boolean,
    key?: string,
  ): MatchResult {
    const remaining = members.filter((m) => ctx.remaining.has(m));
    if (remaining.length === 1) {
      const id = remaining[0] as string;
      const entry =
        (key !== undefined ? this.entries(key, ctx).find((x) => x.entityId === id) : undefined) ??
        ({
          entityId: id,
          key: "",
          text: this.entities.get(id)?.name ?? id,
          kind: "canonical",
        } satisfies Entry);
      return this.resolveEntity(entry, ctx, submitted);
    }
    return { kind: "ambiguous", group, message, members };
  }

  private resolveEntity(entry: Entry, ctx: MatchContext, submitted: boolean): MatchResult {
    const id = entry.entityId;
    const notes: AcceptNote[] = entry.kind === "former" ? ["former-name"] : [];
    const accept = (): MatchResult => ({
      kind: "accept",
      entityId: id,
      via: "exact",
      alias: { text: entry.text, kind: entry.kind },
      notes,
    });
    if (ctx.mode === "type_prompted") {
      if (ctx.promptAnswers?.has(id)) return accept();
      const inQuiz =
        ctx.inQuiz ??
        new Set([...ctx.remaining, ...(ctx.named ?? []), ...(ctx.promptAnswers ?? [])]);
      return inQuiz.has(id)
        ? { kind: "wrong", entityId: id, learn: ctx.learn === true }
        : { kind: "not-in-quiz", entityId: id, reason: this.entities.get(id)?.notInSetReason };
    }
    if (ctx.remaining.has(id)) {
      if (!submitted) {
        const blockedBy = [...(this.longer.get(entry.key) ?? [])].filter(
          (o) => o !== id && ctx.remaining.has(o),
        );
        if (blockedBy.length > 0) return { kind: "hold", entityId: id, holdMs: HOLD_MS, blockedBy };
      }
      return accept();
    }
    if (ctx.named?.has(id)) return { kind: "already-named", entityId: id };
    return { kind: "not-in-quiz", entityId: id, reason: this.entities.get(id)?.notInSetReason };
  }

  private matchFuzzy(key: string, ctx: MatchContext): MatchResult | null {
    const strictness = ctx.strictness ?? "standard";
    const maxT = maxThreshold(strictness);
    if (maxT === 0) return null;
    const codesOn = ctx.enableCodes === true && ctx.mode === "type_all" && strictness === "lenient";
    let best = maxT + 1;
    let hits: { entry: Entry; d: number }[] = [];
    for (let len = Math.max(1, key.length - maxT); len <= key.length + maxT; len++) {
      for (const entry of this.byLength.get(len) ?? []) {
        if (entry.kind === "code" && !codesOn) continue;
        const d = boundedDistance(key, entry.key, Math.min(best, maxT));
        if (d > maxT || d > best) continue;
        if (d < best) {
          best = d;
          hits = [];
        }
        hits.push({ entry, d });
      }
    }
    if (hits.length === 0) return null;
    // (b) No other entity at the same or lower distance.
    if (new Set(hits.map((h) => h.entry.entityId)).size > 1) return null;
    // (a) The best candidate is within the threshold of its own alias length.
    const ok = hits.find((h) => h.d <= fuzzyThreshold(h.entry.key.length, strictness));
    if (!ok) return null;
    // (c) It is a remaining item or the prompt's answer.
    const id = ok.entry.entityId;
    const allowed =
      ctx.mode === "type_all" ? ctx.remaining.has(id) : ctx.promptAnswers?.has(id) === true;
    if (!allowed) return null;
    const notes: AcceptNote[] = ["spelling-corrected"];
    if (ok.entry.kind === "former") notes.push("former-name");
    return {
      kind: "accept",
      entityId: id,
      via: "fuzzy",
      alias: { text: ok.entry.text, kind: ok.entry.kind },
      notes,
    };
  }
}
