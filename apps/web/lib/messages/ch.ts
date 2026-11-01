import { registerMessages } from "../i18n";

/** The `ch.*` strings. They load with the code that uses them, not with the shell. */
export const messages = {
  "ch.roundOf": "Round {n} of {total}",
  "ch.seeResults": "See results",
  "ch.landingTitle": "Silhouette challenge",
  "ch.landingBody": "{n} shapes, the same for everyone with this link. Six guesses each.",
  "ch.beat": "Beat {score} of {max}?",
  "ch.start": "Start the challenge",
  "ch.invalidTitle": "That challenge link isn't valid",
  "ch.invalidBody":
    "It may have been cut off or mistyped. You can still play Silhouette without limits.",
  "ch.loading": "Opening the challenge…",
  "ch.offline":
    "We couldn't reach the server to open this short link. Check your connection and try again.",
  "ch.oldVersion":
    "This challenge used an older version of our data. You'll play the same setup on today's data, which is approximately the same.",
  "ch.createTitle": "Challenge a friend",
  "ch.createBody":
    "Pick a length, play it yourself, then share the link. Anyone who opens it gets the same shapes.",
  "ch.length": "Shapes",
  "ch.createStart": "Play and share",
  "ch.resultsTitle": "Challenge complete",
  "ch.total": "{points} of {max} points · {solved} of {n} solved",
  "ch.compareWin": "You beat the sender: {you} to {them}.",
  "ch.compareTie": "You tied the sender at {you}.",
  "ch.compareLose": "The sender scored {them}; you scored {you}.",
  "ch.shareTitle": "Share this challenge",
  "ch.shareText": "{brand} · Silhouette challenge · {n} shapes\n{points}/{max}\n{link}",
  "ch.copy": "Copy link and score",
  "ch.copied": "Copied to your clipboard.",
  "ch.copyFailed": "Couldn't copy. Select the text and copy it yourself.",
  "ch.shortUnavailable": "Using the long link, which works offline.",
  "ch.playAgain": "Play Silhouette",
  "ch.seenBefore": "You've seen this one before.",
} as const;

registerMessages(messages);
