/** Undirected country graph. Edges are stored once per direction. */
export type Graph = ReadonlyMap<string, readonly string[]>;

export type Edge = { a: string; b: string };

/**
 * Builds the playing graph over `ids` only (the active country set). `crossings` are added when the option is on
 * (border-run §3). Neighbors are sorted so every walk over the graph is deterministic.
 */
export function buildGraph(
  ids: Iterable<string>,
  land: readonly Edge[],
  crossings: readonly Edge[] = [],
): Graph {
  const nodes = new Set(ids);
  const adj = new Map<string, Set<string>>([...nodes].map((id) => [id, new Set<string>()]));
  for (const e of [...land, ...crossings]) {
    if (!nodes.has(e.a) || !nodes.has(e.b) || e.a === e.b) continue;
    adj.get(e.a)?.add(e.b);
    adj.get(e.b)?.add(e.a);
  }
  return new Map([...adj].map(([id, set]) => [id, [...set].sort()]));
}

/** Breadth-first hop distances from `src`; unreachable nodes are absent. */
export function distances(graph: Graph, src: string): Map<string, number> {
  const dist = new Map<string, number>([[src, 0]]);
  const queue = [src];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i] as string;
    const d = dist.get(cur) as number;
    for (const n of graph.get(cur) ?? [])
      if (!dist.has(n)) {
        dist.set(n, d + 1);
        queue.push(n);
      }
  }
  return dist;
}

/** Shortest land-path length between two nodes, or null when they are not connected. */
export const pathLength = (graph: Graph, a: string, b: string): number | null =>
  distances(graph, a).get(b) ?? null;

/**
 * Up to `limit` shortest paths from `a` to `b`, each listed from `a` to `b`, in a stable order
 * (lexicographic by id).
 */
export function shortestPaths(graph: Graph, a: string, b: string, limit = 5): string[][] {
  const da = distances(graph, a);
  const db = distances(graph, b);
  const total = da.get(b);
  if (total === undefined) return [];
  const out: string[][] = [];
  const walk = (path: string[]): void => {
    if (out.length >= limit) return;
    const cur = path[path.length - 1] as string;
    if (cur === b) {
      out.push(path);
      return;
    }
    const d = path.length - 1;
    for (const n of graph.get(cur) ?? [])
      if (da.get(n) === d + 1 && db.get(n) === total - d - 1) walk([...path, n]);
  };
  walk([a]);
  return out;
}

/** Nodes reachable from `from` using only nodes in `allowed`. */
export function component(graph: Graph, from: string, allowed: ReadonlySet<string>): Set<string> {
  const seen = new Set<string>([from]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++)
    for (const n of graph.get(queue[i] as string) ?? [])
      if (allowed.has(n) && !seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
  return seen;
}
