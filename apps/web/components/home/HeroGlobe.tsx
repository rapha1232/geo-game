/** Decorative graticule globe for the home hero. Pure SVG, no data, hidden from assistive tech. */
export function HeroGlobe() {
  const lat = [-60, -30, 0, 30, 60].map((d) => {
    const y = 50 - (d / 90) * 46;
    const rx = Math.sqrt(Math.max(0, 46 * 46 - (y - 50) * (y - 50)));
    return <ellipse key={d} cx="50" cy={y} rx={rx} ry={rx * 0.14} />;
  });
  const lon = [0, 25, 50, 75, 100, 125, 150].map((d) => (
    <ellipse key={d} cx="50" cy="50" rx={46 * Math.abs(Math.cos((d * Math.PI) / 180))} ry="46" />
  ));
  return (
    <svg
      viewBox="0 0 100 100"
      className="hero-globe"
      aria-hidden="true"
      focusable="false"
      style={{ width: "100%", height: "auto", color: "var(--color-accent)" }}
    >
      <circle
        cx="50"
        cy="50"
        r="46"
        fill="var(--tint-accent)"
        stroke="currentColor"
        strokeWidth="0.6"
      />
      <g fill="none" stroke="currentColor" strokeWidth="0.35" opacity="0.55">
        {lat}
        {lon}
      </g>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="0.9" />
      <circle cx="68" cy="34" r="2.2" fill="currentColor" />
      <circle cx="68" cy="34" r="4.5" fill="none" stroke="currentColor" strokeWidth="0.5" />
    </svg>
  );
}
