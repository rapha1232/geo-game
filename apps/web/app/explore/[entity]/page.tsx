import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { AtlasExplorer } from "../../../components/atlas/AtlasExplorer";
import { countryName } from "../../../lib/countries";
import { t } from "../../../lib/i18n";
import "../../../lib/messages/at";

/**
 * Resolves the path segment: `country:PER` for a sovereign-197 member, `territory:ABW` for a territory (checked against
 * the pack on the client), or a bare `PER`, which redirects to its canonical form. Anything else is a 404.
 */
function resolve(raw: string): { id: string; name: string | null } | "redirect" | null {
  const id = decodeURIComponent(raw);
  const bare = /^[A-Za-z]{3}$/.test(id) ? id.toUpperCase() : null;
  if (bare && countryName(bare)) return "redirect";
  const m = /^(country|territory):([A-Z]{3})$/.exec(id);
  if (!m) return null;
  if (m[1] === "territory") return { id, name: null };
  const name = countryName(m[2]!);
  return name ? { id, name } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entity: string }>;
}): Promise<Metadata> {
  const r = resolve((await params).entity);
  const name = r && r !== "redirect" ? r.name : null;
  return {
    title: name ? `${name} · ${t("at.title")}` : t("at.title"),
    alternates: r && r !== "redirect" ? { canonical: `/explore/${r.id}` } : undefined,
  };
}

/** `/explore/country:PER` opens the Atlas with that place's card showing. */
export default async function Page({ params }: { params: Promise<{ entity: string }> }) {
  const raw = (await params).entity;
  const r = resolve(raw);
  if (r === "redirect")
    permanentRedirect(`/explore/country:${decodeURIComponent(raw).toUpperCase()}`);
  if (!r) notFound();
  return <AtlasExplorer initialEntity={r.id} />;
}
