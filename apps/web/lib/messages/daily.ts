import { registerMessages } from "../i18n";

/** The `daily.*` strings. They load with the code that uses them, not with the shell. */
export const messages = {
  "daily.lede":
    "Five small puzzles, the same for everyone, new every day. All optional, never a streak.",
  "daily.title": "Daily",
  "daily.silhouette": "Silhouette of the day",
  "daily.silhouetteBody": "One shape for everyone, new every day. Optional, and never a streak.",
  "daily.play": "Play today's Silhouette",
  "daily.resume": "Resume today's Silhouette",
  "daily.loading": "Checking today's puzzle…",
  "daily.unavailable":
    "Today's daily isn't available right now. You can still play Silhouette without limits.",
  "daily.done": "You've played today's Silhouette.",
  "daily.deepCut": "Deep Cut: Daily 5",
  "daily.deepCutBody": "The same five prompts for everyone today. Find the rarest answer you can.",
  "daily.playDeepCut": "Play today's Deep Cut",
  "daily.resumeDeepCut": "Resume today's Deep Cut",
  "daily.doneDeepCut": "Today's Deep Cut is done",
  "daily.quiz": "Daily Quiz",
  "daily.quizBody":
    "One short quiz a day, the same for everyone. A different kind of question each day.",
  "daily.playQuiz": "Play today's quiz",
  "daily.resumeQuiz": "Resume today's quiz",
  "daily.doneQuiz": "Today's quiz is done",
  "daily.borderRun": "Border Run: Daily route",
  "daily.borderRunBody":
    "One route a day, the same for everyone. Connect the two countries by land.",
  "daily.playBorderRun": "Play today's route",
  "daily.resumeBorderRun": "Resume today's route",
  "daily.doneBorderRun": "Today's route is done",
  "daily.moreRoutes": "More routes",
  "daily.factPin": "Fact Pin: Daily 5",
  "daily.factPinBody":
    "Five facts for everyone, new every day. Pin where each one happened. Optional.",
  "daily.playFactPin": "Play today's Daily 5",
  "daily.resumeFactPin": "Resume today's Daily 5",
  "daily.doneFactPin": "You've played today's Daily 5.",
  "daily.moreFacts": "More facts: Endless",
  "daily.result": "{outcome} · {score} of {max} points",
  "daily.share": "Share your result",
  "daily.shareAll": "Copy all of today's results",
  "daily.shareAllBody":
    "You've played {count} of {total} dailies today. Share them in one message, spoiler-free.",
  "daily.copy": "Copy result",
  "daily.copied": "Copied to your clipboard.",
  "daily.copyFailed": "Couldn't copy. Select the text and copy it yourself.",
  "daily.next": "Next daily in {time}",
  "daily.keepPlaying": "Keep playing: Unlimited",
  "daily.practice": "Practice this shape",
  "daily.seeSummary": "See your summary",
} as const;

registerMessages(messages);
