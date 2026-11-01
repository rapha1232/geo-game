// Everything CI would run, plus the browser audits, on this machine (GitHub Actions minutes are not available).
//   pnpm verify          all checks
//   pnpm verify --quick  skip the production build and the browser audits
// Needs the pinned content (`pnpm content:fetch && pnpm content:dev`) and the pre-installed Playwright browser.
import { spawn, spawnSync } from "node:child_process";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const quick = process.argv.includes("--quick");
const PORT = 3111;
const base = `http://localhost:${PORT}`;
const results = [];

function run(name, cmd, args, opts = {}) {
  const t0 = Date.now();
  console.log(`\n▶ ${name}`);
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
  const ok = r.status === 0;
  results.push({ name, ok, s: ((Date.now() - t0) / 1000).toFixed(0) });
  return ok;
}

run("format", "pnpm", ["format:check"]);
run("lint", "pnpm", ["lint"]);
run("typecheck", "pnpm", ["typecheck"]);
run("test", "pnpm", ["test"]);

if (!quick && run("build", "pnpm", ["--filter", "@meridian/web", "build"])) {
  run("bundle budget", "pnpm", ["--filter", "@meridian/web", "budget"]);
  const server = spawn(
    "pnpm",
    ["--filter", "@meridian/web", "exec", "next", "start", "-p", String(PORT)],
    {
      cwd: root,
      stdio: "ignore",
      detached: true,
    },
  );
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) {
      try {
        up = (await fetch(`${base}/api/v1/health`)).status < 600;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    if (!up) results.push({ name: "start server", ok: false, s: "60" });
    else {
      // The audits load Playwright from the global install.
      const npmRoot = execSync("npm root -g").toString().trim();
      const env = { ...process.env, NODE_PATH: npmRoot };
      for (const [name, script] of [
        ["site", "site-audit.mjs"],
        ["accessibility", "a11y-audit.mjs"],
        ["i18n", "i18n-audit.mjs"],
        ["network", "network-audit.mjs"],
        ["offline", "offline-check.mjs"],
      ])
        run(name, "node", [`apps/web/scripts/${script}`, base], { env });
    }
  } finally {
    try {
      process.kill(-server.pid);
    } catch {
      /* already gone */
    }
  }
}

console.log("\n── summary");
for (const r of results) console.log(`${r.ok ? "✓" : "✕"} ${r.name} (${r.s}s)`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
