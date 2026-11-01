import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubdivisionGame } from "../../../../components/subdivisions/SubdivisionGame";
import { findSubCountry, subTitle } from "../../../../lib/subdivisions/list";
import { t } from "../../../../lib/i18n";
import "../../../../lib/messages/sb";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ country: string }>;
}): Promise<Metadata> {
  const c = findSubCountry((await params).country);
  return { title: c ? subTitle(c) : t("sb.title") };
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  if (!findSubCountry(country)) notFound();
  return <SubdivisionGame code={country} />;
}
