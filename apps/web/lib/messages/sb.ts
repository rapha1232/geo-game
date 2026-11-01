import { registerMessages } from "../i18n";

/** The `sb.*` strings. They load with the code that uses them, not with the shell. */
export const messages = {
  "sb.title": "Subdivisions",
  "sb.intro": "Learn the states, provinces and regions of a country.",
  "sb.format": "Format",
  "sb.format.name": "Name them all",
  "sb.format.find": "Find it on the map",
  "sb.start": "Start",
  "sb.input": "Type a name",
  "sb.count": "{n} of {total} named",
  "sb.findPrompt": "Find: {name}",
  "sb.findProgress": "{n} of {total} found",
  "sb.tries": "{n} tries left",
  "sb.wrong": "That's {name}.",
  "sb.missed": "It was {name}.",
  "sb.right": "Found it.",
  "sb.alreadyNamed": "Already named.",
  "sb.notRecognized": "Not recognised here.",
  "sb.giveUp": "Give up",
  "sb.mapAria": "Map of the subdivisions. In Find it, select the one you are asked for.",
  "sb.done": "Finished: {n}%",
  "sb.gaveUp": "You gave up with {n}%.",
  "sb.missedList": "Missed: {list}",
  "sb.best": "Best: {n}%",
  "sb.newBest": "New personal best!",
  "sb.again": "Play again",
  "sb.back": "All countries",
  "sb.loading": "Loading the map…",
  "sb.loadError": "The map didn't load. Check your connection and try again.",
  "sb.list": "Choose a country",
} as const;

registerMessages(messages);
