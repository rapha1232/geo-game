import { parseSilhouetteChallenge } from "../../../lib/challenges/silhouette";
import { t } from "../../../lib/i18n";
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from "../../../lib/og/card";
import "../../../lib/messages/ch";

export const alt = "Silhouette challenge";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** The challenge's own preview: "Beat 34 of 60?" when the sender's score rides along in the link. */
export default async function Image({ params }: { params: Promise<{ code: string }> }) {
  let title = t("ch.landingTitle");
  let body = t("ch.shareDescription");
  try {
    const p = parseSilhouetteChallenge(decodeURIComponent((await params).code));
    body = t("ch.landingBody", { n: p.config.n });
    if (p.payload.sc !== undefined)
      title = t("ch.beat", { score: p.payload.sc, max: p.config.n * (6 + p.config.f.length) });
  } catch {
    // A short code (resolved in the browser) or a broken link: the generic challenge card.
  }
  return ogCard({ eyebrow: t("ch.landingTitle"), title, body });
}
