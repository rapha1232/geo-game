import type { messages as qz } from "./messages/qz";
import type { messages as at } from "./messages/at";
import type { messages as fp } from "./messages/fp";
import type { messages as sil } from "./messages/sil";
import type { messages as rk } from "./messages/rk";
import type { messages as br } from "./messages/br";
import type { messages as dc } from "./messages/dc";
import type { messages as me } from "./messages/me";
import type { messages as set } from "./messages/set";
import type { messages as daily } from "./messages/daily";
import type { messages as ch } from "./messages/ch";
import type { messages as sb } from "./messages/sb";
import type { messages as rp } from "./messages/rp";
import type { messages as cat } from "./messages/cat";

// English-only in R1; every user-facing string goes through t() so R4 localization is additive.
// Strings the shell needs are here. A game's own strings live in `./messages/<game>.ts` and register themselves when
// that game's code loads, so they stay out of the shell bundle (ARCHITECTURE §13). A component that uses a game's
// strings imports that module for its side effect.
const core = {
  "app.tagline": "Geography, history and knowledge games. Unlimited play. No account needed.",
  "app.comingSoon": "The first games are on their way.",
  "footer.rights": "© {year} {brand}. All rights reserved.",
  "notFound.title": "Page not found",
  "notFound.body": "That page does not exist, or it has moved.",
  "notFound.home": "Back to the start",
  "theme.label": "Theme",
  "theme.system": "System",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "footer.legalNav": "Legal",
  "footer.terms": "Terms of Service",
  "footer.privacy": "Privacy Policy",
  "nav.main": "Main",
  "nav.play": "Play",
  "nav.daily": "Daily",
  "nav.explore": "Atlas",
  "nav.me": "Me",
  "nav.settings": "Settings",
  "empty.play": "The game catalog opens with the first release. Check back soon.",
  "empty.daily": "Daily challenges arrive with the first games. They are always optional.",
  "empty.me": "No rounds yet. Your stats appear after your first game.",
  "empty.settings": "Settings arrive with the first games: units, accessibility and your data.",
  "continue.title": "Continue",
  "continue.resume": "Resume",
  "continue.discard": "Discard",
  "state.storageUnavailable": "Your browser isn't letting us save progress. You can still play.",
  "state.offlineUncached":
    "Available when you're back online. It will load by itself once you are.",
  "state.offline": "You're offline. Games you've played recently still work.",
  "terms.title": "Terms of Service",
  "privacy.title": "Privacy Policy",
  "legal.updated": "Last updated {date}",
  "about.title": "About",
  "about.body":
    "{brand} is a set of geography, history and knowledge games with unlimited play and no account needed. Every name, border and fact comes from a named source, listed on the Sources page.",
  "sources.title": "Sources and licences",
  "sources.intro": "Everything we build on, with its licence and the credit it asks for.",
  "sources.licence": "licence",
  "sources.kind.dataset": "Data",
  "sources.kind.font": "Fonts",
  "sources.kind.icons": "Icons",
  "sources.kind.image": "Images",
  "sources.naturalEarth": "Made with Natural Earth.",
  "play.silhouette":
    "Name the country from its outline. Six guesses, with distance and direction after each.",
  "play.start": "Play Silhouette",
  "home.hero": "Know the world. Play as long as you like.",
  "home.playNow": "Play something now",
  "home.games": "Games",
  "home.popular": "Popular quizzes",
  "home.practice": "Practice your weak spots",
  "home.today": "Today (optional)",
  "home.todaySil": "Silhouette daily",
  "home.todayDone": "played",
  "home.todayOpen": "not played yet",
  "home.allQuizzes": "All games and quizzes",
  "home.play": "Play",
  "rules.title": "Rules and scoring",
  "corrections.title": "Content corrections",
  "corrections.intro":
    "Changes to names, facts and maps, newest first. Reports from players are reviewed within 7 days.",
  "corrections.report": "Spotted a mistake? Use Report a problem on any result.",
  "sil.continent.AF": "Africa",
  "sil.continent.AS": "Asia",
  "sil.continent.EU": "Europe",
  "sil.continent.NA": "North America",
  "sil.continent.OC": "Oceania",
  "sil.continent.SA": "South America",
  "ach.title": "Achievements",
  "ach.intro":
    "Badges for things you have done. They are yours alone: no leaderboard, no pressure.",
  "ach.unlocked": "Unlocked {date}",
  "ach.locked": "Not yet",
  "ach.count": "{n} of {total} unlocked",
  "ach.toast": "Achievement unlocked: {name}",
  "ach.link": "See your achievements",
  "ach.back": "Back to your profile",
  "ach.loadError": "Your achievements didn't load. Try again in a moment.",
  "streak.title": "Daily streak",
  "streak.current": "{n} days",
  "streak.currentOne": "1 day",
  "streak.longest": "Longest: {n}",
  "streak.freezes": "Rest days in hand: {n}",
  "streak.note":
    "Any completed round on a day keeps it going. A missed day uses a rest day if you have one.",
} as const;

type Messages = typeof core &
  typeof qz &
  typeof at &
  typeof fp &
  typeof sil &
  typeof rk &
  typeof br &
  typeof dc &
  typeof me &
  typeof set &
  typeof daily &
  typeof ch &
  typeof sb &
  typeof rp &
  typeof cat;
export type MessageKey = keyof Messages;

const registry: Record<string, string> = { ...core };

/** Adds a module's strings. Called once, when the module loads. */
export function registerMessages(m: Readonly<Record<string, string>>): void {
  Object.assign(registry, m);
}

export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  return Object.entries(params).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    registry[key] as string,
  );
}
