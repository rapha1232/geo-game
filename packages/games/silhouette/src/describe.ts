export type ShapeMetrics = {
  /** Width over height of the main group, measured on the projected shape. */
  aspect: number;
  remoteParts: number;
};

/** Non-revealing description for screen readers (silhouette §10). */
export function describeShape(m: ShapeMetrics): string {
  const form =
    m.aspect > 2.2
      ? "long and wide"
      : m.aspect > 1.3
        ? "wider than it is tall"
        : m.aspect < 0.45
          ? "long and narrow"
          : m.aspect < 0.77
            ? "taller than it is wide"
            : "compact, roughly as wide as it is tall";
  const parts =
    m.remoteParts === 0
      ? "no remote parts"
      : m.remoteParts === 1
        ? "1 remote part"
        : `${m.remoteParts} remote parts`;
  return `Shape: ${form}, ${parts}.`;
}
