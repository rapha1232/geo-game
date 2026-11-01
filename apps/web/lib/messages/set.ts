import { registerMessages } from "../i18n";

/** The `set.*` strings. They load with the code that uses them, not with the shell. */
export const messages = {
  "set.title": "Settings",
  "set.display": "Display",
  "set.theme": "Theme",
  "set.motion": "Reduced motion",
  "set.motion.system": "Follow my device",
  "set.motion.reduce": "Always reduce",
  "set.contrast": "High-contrast map colours",
  "set.play": "Play",
  "set.units": "Distance units",
  "set.units.auto": "From my language",
  "set.units.km": "Kilometres",
  "set.units.mi": "Miles",
  "set.strictness": "Answer strictness",
  "set.strictness.lenient": "Lenient",
  "set.strictness.standard": "Standard",
  "set.strictness.strict": "Strict",
  "set.countrySet": "Countries in quizzes",
  "set.countrySet.sovereign-197": "197 sovereign countries",
  "set.countrySet.un-193": "193 UN members",
  "set.accessible": "Use the accessible, map-free variants by default",
  "set.saved": "Saved on this device.",
  "set.saveFailed":
    "Your browser isn't letting us save settings. They apply until you close the tab.",
  "set.data": "Your data",
  "set.dataBody":
    "Everything is stored on this device. Export it to back it up or move it to another browser.",
  "set.export": "Export my data",
  "set.exported": "Exported {n} results.",
  "set.import": "Import data",
  "set.importHelp":
    "Choose a file exported from Meridian. It is merged with what is here; nothing is overwritten.",
  "set.importDone": "Imported {results} results. {skipped} skipped.",
  "set.importFail.too-large": "That file is too large to import.",
  "set.importFail.not-json": "That file isn't a Meridian export.",
  "set.importFail.not-meridian": "That file isn't a Meridian export.",
  "set.importFail.damaged": "That export looks damaged, so nothing was imported.",
  "set.importFail.storage": "Your browser couldn't store the imported data.",
  "set.delete": "Delete all data on this device",
  "set.deleteTitle": "Delete everything on this device?",
  "set.deleteBody":
    "This removes your results, personal bests, mastery, favorites, settings and saved games from this browser. It can't be undone. Export first if you want a copy.",
  "set.deleteConfirm": "Delete all data",
  "set.deleted": "All data on this device was deleted.",
  "set.streaks": "Show my daily streak on my profile",
  "set.telemetry": "Share anonymous answer statistics",
  "set.telemetryNote":
    "Off by default. When on, which items were answered right or wrong is sent without your name, account or IP address, to help us tune difficulty. Turn it off any time and nothing more is sent.",
  "set.neighborsFollowUp": "Silhouette: also ask for the neighbours after each round",
} as const;

registerMessages(messages);
