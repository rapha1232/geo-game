import type { BuildOutput } from "./build.ts";

export type PutFn = (
  pathname: string,
  body: Uint8Array | string,
  options: {
    access: "public";
    addRandomSuffix: false;
    allowOverwrite: boolean;
    cacheControlMaxAge: number;
    contentType: string;
  },
) => Promise<{ url: string }>;

const YEAR = 31_536_000;

/**
 * Uploads a build to the content host. Pack files are immutable (content-hashed names, one year of caching).
 * The manifest is the only mutable file, with a short cache (API_CONTRACTS §3). Returns the uploaded paths.
 */
export async function uploadBuild(
  out: BuildOutput,
  put: PutFn,
  opts: { prefix?: string; updateManifest: boolean },
): Promise<string[]> {
  const prefix = opts.prefix ?? "content";
  const sent: string[] = [];
  const send = async (
    path: string,
    body: Uint8Array | string,
    contentType: string,
    immutable: boolean,
  ) => {
    await put(path, body, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: !immutable,
      cacheControlMaxAge: immutable ? YEAR : 300,
      contentType,
    });
    sent.push(path);
  };
  for (const f of out.files)
    await send(`${prefix}/${out.version}/${f.file}`, f.bytes, "application/json", true);
  await send(`${prefix}/${out.version}/RELEASE_NOTES.md`, out.releaseNotes, "text/markdown", true);
  if (opts.updateManifest)
    await send(
      `${prefix}/manifest.json`,
      `${JSON.stringify(out.manifest, null, 2)}\n`,
      "application/json",
      false,
    );
  return sent;
}
