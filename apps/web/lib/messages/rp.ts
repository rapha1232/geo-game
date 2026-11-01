import { registerMessages } from "../i18n";

/** The `rp.*` strings. They load with the code that uses them, not with the shell. */
export const messages = {
  "rp.open": "Report a problem",
  "rp.title": "Report a problem",
  "rp.close": "Close",
  "rp.category": "What is wrong?",
  "rp.cat.answer_rejected": "A correct answer was rejected",
  "rp.cat.answer_accepted_wrongly": "A wrong answer was accepted",
  "rp.cat.wrong_fact": "Wrong fact",
  "rp.cat.map_issue": "Map or border issue",
  "rp.cat.spelling": "Spelling or name",
  "rp.cat.sensitive": "Offensive or sensitive",
  "rp.cat.other": "Something else",
  "rp.message": "Tell us what happened",
  "rp.messageHelp": "{count} of {max} characters. At least 10.",
  "rp.messageShort": "Add a little more detail (at least 10 characters).",
  "rp.messageLong": "Please keep it under {max} characters.",
  "rp.email": "Email (optional, only if you want a reply)",
  "rp.emailInvalid": "That email address doesn't look right.",
  "rp.attached":
    "We attach the game, round, content version and your last answer so editors can reproduce it.",
  "rp.send": "Send report",
  "rp.sending": "Sending…",
  "rp.thanks":
    "Thanks. Our editors review reports within 7 days. Changes are listed on the corrections page.",
  "rp.rateLimited": "You've sent a lot of reports. Try again in {s} seconds.",
  "rp.invalid": "The report couldn't be sent. Check the details and try again.",
  "rp.failed": "The report didn't go through. Check your connection and try again.",
} as const;

registerMessages(messages);
