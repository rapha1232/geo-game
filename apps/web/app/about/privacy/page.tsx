import { permanentRedirect } from "next/navigation";

/** UX_AND_DESIGN §2 lists /about/privacy; the canonical page is /privacy. */
export default function AboutPrivacy(): never {
  permanentRedirect("/privacy");
}
