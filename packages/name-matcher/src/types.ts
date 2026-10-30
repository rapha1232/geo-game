export type AliasKind =
  "canonical" | "common" | "official" | "ascii" | "former" | "endonym" | "code";

export type Alias = { text: string; kind: AliasKind; lang?: string; script?: string };

/** One answerable item of the answer universe (an entity, or an item whose answers are its capitals). */
export type MatchEntity = {
  id: string;
  /** Canonical display name. Indexed as an alias of kind `canonical`. */
  name: string;
  aliases: readonly Alias[];
  /** Shown when the entity is typed in a quiz where it doesn't count. */
  notInSetReason?: string;
};

export type AmbiguityGroup = {
  group: string;
  alias: string;
  members: readonly string[];
  message: string;
};

export type Strictness = "lenient" | "standard" | "strict";

export type MatchContext = {
  mode: "type_all" | "type_prompted";
  /** Items still to be named (TYPE_ALL) or still to be asked (TYPE_PROMPTED). */
  remaining: ReadonlySet<string>;
  /** Items already named (TYPE_ALL). */
  named?: ReadonlySet<string>;
  /** TYPE_PROMPTED: the accepted answers for the current prompt. */
  promptAnswers?: ReadonlySet<string>;
  /** All items of the quiz (TYPE_PROMPTED "wrong" vs "not in this quiz"). Defaults to remaining ∪ named ∪ promptAnswers. */
  inQuiz?: ReadonlySet<string>;
  strictness?: Strictness;
  /** `code` aliases count only in TYPE_ALL with Lenient strictness. */
  enableCodes?: boolean;
  /** Learn mode shows "That's X, not this one." for wrong answers. */
  learn?: boolean;
};

export type AcceptNote = "former-name" | "spelling-corrected";

export type MatchResult =
  | { kind: "ignore" }
  | { kind: "try-english" }
  | { kind: "not-recognized" }
  | {
      kind: "accept";
      entityId: string;
      via: "exact" | "fuzzy";
      alias: { text: string; kind: AliasKind };
      notes: AcceptNote[];
    }
  /** The exact key of a remaining item is a prefix of another remaining item's alias (quiz-library §5.2). */
  | { kind: "hold"; entityId: string; holdMs: number; blockedBy: string[] }
  | { kind: "ambiguous"; group: string; message: string; members: string[] }
  | { kind: "already-named"; entityId: string }
  | { kind: "not-in-quiz"; entityId: string; reason: string | undefined }
  | { kind: "wrong"; entityId: string; learn: boolean };

/** Prefix-hold duration (quiz-library §5.2). */
export const HOLD_MS = 700;
