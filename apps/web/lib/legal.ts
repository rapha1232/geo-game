import { BRAND_NAME, CONTACT_URL, PRODUCTION_URL } from "./brand";
import type { Section } from "../components/Prose";

/** Bump when either document changes in substance. */
export const LEGAL_UPDATED = "2026-10-30";

export const TERMS: readonly Section[] = [
  {
    heading: "Using Meridian",
    paragraphs: [
      `${BRAND_NAME} (${PRODUCTION_URL}) is a free set of geography, history and knowledge games. By using it you agree to these terms. If you do not agree, please do not use it.`,
      "You do not need an account. You may play for any personal, non-commercial purpose.",
    ],
  },
  {
    heading: "Ownership and licence",
    paragraphs: [
      `The ${BRAND_NAME} name, software, game designs, questions, facts, written content and layout are © ${BRAND_NAME}. All rights reserved.`,
      "Third-party data, fonts and icons that we use remain under their own licences. They are listed, with their attribution, on the Sources page.",
      "You may not copy, scrape, resell or republish our content or build a competing service from it without our written permission. Sharing a link, a challenge code or a screenshot of your own results is welcome.",
    ],
  },
  {
    heading: "Acceptable use",
    bullets: [
      "Do not attack, overload or probe the service, or try to get around its limits.",
      "Do not use automated tools to play, to read content in bulk, or to submit reports.",
      "Do not submit unlawful, abusive or misleading content through a report.",
    ],
  },
  {
    heading: "Accuracy of content",
    paragraphs: [
      "We check our content against named sources and fix mistakes when we find them, but borders, names and facts change and some of them are contested. The maps and answers are for play and learning. They are not legal, political, navigational or survey advice, and they do not express a position on any dispute.",
      "If you think something is wrong, tell us (see Contact below).",
    ],
  },
  {
    heading: "Your progress",
    paragraphs: [
      "Without an account, your progress, settings and history are kept only in your browser. Clearing site data, switching browsers or devices, or private browsing can remove them. We cannot recover them for you.",
    ],
  },
  {
    heading: "No warranty and limits of liability",
    paragraphs: [
      `${BRAND_NAME} is provided “as is” and “as available”, without promises that it will be uninterrupted, error free or fit for a particular purpose. To the extent the law allows, we are not liable for indirect or consequential loss, or for loss of data, arising from your use of the service. Nothing in these terms limits any right or liability that cannot be limited by law, including your rights as a consumer.`,
    ],
  },
  {
    heading: "Changes and suspension",
    paragraphs: [
      "We may change the service or these terms, or suspend access for misuse. When the terms change in substance we update the date at the top of this page. Continued use after a change means you accept it.",
    ],
  },
  {
    heading: "Contact",
    paragraphs: [`Questions about these terms, or requests about content: ${CONTACT_URL}`],
  },
];

export const PRIVACY: readonly Section[] = [
  {
    heading: "The short version",
    bullets: [
      "No account is needed and no sign-in cookies are set.",
      "Your progress, settings and results stay on your device.",
      "We count visits with cookieless, aggregate analytics that do not identify you.",
      "We only receive personal information if you choose to send it, for example an email address with a report.",
    ],
  },
  {
    heading: "What stays on your device",
    paragraphs: [
      "Meridian stores your theme choice, settings, results, statistics and any game in progress in your browser (local storage and IndexedDB). This is not sent to us. You can export or delete it in Settings, or by clearing site data in your browser.",
    ],
  },
  {
    heading: "What we receive",
    bullets: [
      "Challenge codes. When you create a short challenge link, we store the challenge settings (game, scope, seed and a few options) and a short code. It holds no name, email or account information. Codes expire two years after they were last used.",
      "Reports. When you report a problem we store what you tell us about the question or fact, and your email address only if you choose to give one so we can reply. Reports are kept for two years.",
      "Analytics. We use Vercel Web Analytics to measure page views and performance in aggregate. It does not use cookies and does not follow you across sites or visits.",
      "Server logs. Our hosting provider keeps standard technical logs (such as IP address, time and requested page) for security and reliability. We do not use them to profile anyone.",
    ],
  },
  {
    heading: "What we do not do",
    bullets: [
      "We do not sell personal information.",
      "We do not run advertising or advertising trackers.",
      "We do not build a profile of you across sites.",
    ],
  },
  {
    heading: "Who processes data for us",
    paragraphs: [
      "Our hosting and analytics run on Vercel, and our database (challenge codes and reports) runs on Neon. They process data only to provide those services to us.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "You can ask us what we hold about you (usually only a report you sent), ask us to correct or delete it, and complain to your data-protection authority. Because we do not link your device data to you, we cannot look up or delete data that only exists in your browser. You can remove it yourself at any time.",
      "Children: Meridian does not ask for personal information. If you are under 16, please do not send us your email address.",
    ],
  },
  {
    heading: "Changes and contact",
    paragraphs: [
      "If we start something that changes this page materially, for example optional accounts, we will update it first and change the date above.",
      `Privacy questions and requests: ${CONTACT_URL}`,
    ],
  },
];
