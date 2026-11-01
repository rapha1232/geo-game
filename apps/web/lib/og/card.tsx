import { ImageResponse } from "next/og";
import { BRAND_NAME } from "../brand";

/** Link-preview images (Open Graph): 1200 × 630, the brand palette, no external fonts or images. */
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const INK = "#1b2430";
const PAPER = "#f7f4ee";
const ACCENT = "#b4532a";
const MUTED = "#5b6573";

/** The globe mark: a circle, one meridian and the equator, as in the nav and the favicon. */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512">
      <rect width="512" height="512" rx="112" fill={ACCENT} />
      <circle cx="256" cy="256" r="164" fill="none" stroke={PAPER} strokeWidth="30" />
      <ellipse cx="256" cy="256" rx="70" ry="164" fill="none" stroke={PAPER} strokeWidth="30" />
      <path d="M92 256h328" stroke={PAPER} strokeWidth="30" strokeLinecap="round" />
    </svg>
  );
}

/** Faint graticule rings in the corner, the site's decorative motif. */
function Rings() {
  return (
    <svg
      width="640"
      height="640"
      viewBox="0 0 640 640"
      style={{ position: "absolute", right: -160, bottom: -200 }}
    >
      {[80, 140, 200, 260, 320].map((r) => (
        <circle
          key={r}
          cx="320"
          cy="320"
          r={r}
          fill="none"
          stroke={ACCENT}
          strokeOpacity="0.18"
          strokeWidth="2"
        />
      ))}
      <ellipse
        cx="320"
        cy="320"
        rx="130"
        ry="320"
        fill="none"
        stroke={ACCENT}
        strokeOpacity="0.18"
        strokeWidth="2"
      />
      <path d="M0 320h640" stroke={ACCENT} strokeOpacity="0.18" strokeWidth="2" />
    </svg>
  );
}

export function ogCard({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: PAPER,
        color: INK,
        position: "relative",
        fontFamily: "serif",
      }}
    >
      <Rings />
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <Mark size={64} />
        <span style={{ fontSize: 40 }}>{BRAND_NAME}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 900 }}>
        <span
          style={{
            fontSize: 24,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: ACCENT,
            fontFamily: "sans-serif",
          }}
        >
          {eyebrow}
        </span>
        <span style={{ fontSize: title.length > 28 ? 72 : 92, lineHeight: 1.05 }}>{title}</span>
        <span style={{ fontSize: 32, color: MUTED, fontFamily: "sans-serif", lineHeight: 1.35 }}>
          {body}
        </span>
      </div>
    </div>,
    OG_SIZE,
  );
}
