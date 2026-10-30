import type { ClickEvent, HintEvent, QuizState, QuizWorld, TypeEvent } from "@meridian/quiz";
import { t } from "../i18n";

export type Status = { tone: "neutral" | "success" | "error" | "hint"; text: string };

const done = (s: QuizState): number => s.items.filter((i) => i.status !== "pending").length;

/** What to say after typing, shown in the live status line (quiz-library §7.2). */
export function typeStatus(
  world: QuizWorld,
  s: QuizState,
  e: TypeEvent,
  itemName: (id: string) => string,
): Status | null {
  switch (e.kind) {
    case "accepted":
      return {
        tone: "success",
        text:
          e.note === "spelling-corrected"
            ? t("qz.acceptedAs", { name: e.text })
            : e.note === "former-name"
              ? t("qz.formerName", { name: e.text })
              : t("qz.accepted", {
                  name: itemName(e.itemId),
                  done: done(s),
                  total: s.items.length,
                }),
      };
    case "already-named":
      return { tone: "error", text: t("qz.alreadyNamed", { name: e.name }) };
    case "ambiguous":
      return { tone: "hint", text: e.message };
    case "not-in-quiz":
      return { tone: "hint", text: e.message };
    case "not-recognized":
      return { tone: "error", text: t("qz.notRecognized") };
    case "try-english":
      return { tone: "hint", text: t("qz.tryEnglish") };
    case "wrong":
      return {
        tone: "error",
        text: e.learn
          ? t("qz.wrongLearn", { name: world.byId.get(e.entityId)?.name ?? "" })
          : t("qz.wrong"),
      };
    default:
      return null;
  }
}

export function clickStatus(world: QuizWorld, e: ClickEvent): Status | null {
  switch (e.kind) {
    case "correct":
      return { tone: "success", text: t("qz.clickCorrect") };
    case "wrong": {
      const name = world.byId.get(e.clickedId)?.name ?? "";
      return {
        tone: "error",
        text:
          e.triesLeft === 1
            ? t("qz.clickWrongOne", { name })
            : t("qz.clickWrong", { name, n: e.triesLeft }),
      };
    }
    case "missed":
      return {
        tone: "error",
        text: t("qz.clickMissed", {
          name: e.answer.length === 1 ? (world.byId.get(e.answer[0] as string)?.name ?? "") : "",
        }),
      };
    default:
      return null;
  }
}

export function hintStatus(e: HintEvent): Status | null {
  switch (e.kind) {
    case "letter":
      return { tone: "hint", text: t("qz.hintLetter", { letter: e.letter }) };
    case "blanks":
      return { tone: "hint", text: e.pattern };
    case "group":
      return { tone: "hint", text: t("qz.hintGroup", { name: e.name }) };
    case "highlight":
      return { tone: "hint", text: t("qz.hintHighlight") };
    case "zoom-region":
      return { tone: "hint", text: t("qz.hintZoom") };
    case "neighbors":
      return { tone: "hint", text: t("qz.hintNeighbors") };
    case "fifty":
      return { tone: "hint", text: t("qz.hintFifty") };
    case "none":
      return { tone: "hint", text: t("qz.hintNone") };
  }
}
