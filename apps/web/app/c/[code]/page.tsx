import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { parseShortCode } from "@meridian/game-kit";
import { BRAND_NAME } from "../../../lib/brand";
import { ChallengeLanding } from "../../../components/challenge/ChallengeLanding";
import { parseSilhouetteChallenge, type ParsedChallenge } from "../../../lib/challenges/silhouette";
import { t } from "../../../lib/i18n";
import "../../../lib/messages/ch";

type Params = { params: Promise<{ code: string }> };

/**
 * A long code is checked here too, so a broken link answers 404 (the not-found page of this segment keeps the
 * friendly copy). A short code needs the database, so the landing resolves it on the device as before.
 */
function check(raw: string): { code: string; parsed: ParsedChallenge | null } | null {
  const code = decodeURIComponent(raw);
  if (parseShortCode(code)) return { code, parsed: null };
  try {
    return { code, parsed: parseSilhouetteChallenge(code) };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = check((await params).code);
  const p = c?.parsed;
  const beat =
    p && p.payload.sc !== undefined
      ? t("ch.beat", { score: p.payload.sc, max: p.config.n * (6 + p.config.f.length) })
      : null;
  const description = p ? t("ch.landingBody", { n: p.config.n }) : t("ch.shareDescription");
  return {
    title: beat ? `${beat} · ${t("ch.landingTitle")}` : t("ch.landingTitle"),
    description,
    robots: { index: false },
    openGraph: {
      type: "website",
      siteName: BRAND_NAME,
      title: beat ?? t("ch.landingTitle"),
      description,
    },
  };
}

export default async function Page({ params }: Params) {
  const c = check((await params).code);
  if (!c) notFound();
  return <ChallengeLanding code={c.code} />;
}
