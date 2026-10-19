import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { INSTANCES, MOCK_PORT, urlOf, type InstanceName } from "./instances";
import { startMock } from "./mock-provider";

const procs: ChildProcess[] = [];
const dirs: string[] = [];

async function waitFor(url: string, ms: number) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.status < 500) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`timed out waiting for ${url}`);
}

async function assertPortFree(port: number) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1000) });
  } catch {
    return;
  }
  // Something already answers here — testing it would silently test a stale server.
  throw new Error(`port ${port} is already in use; stop the leftover wrangler/workerd process first`);
}

export default async function setup() {
  const env = { ...process.env, WRANGLER_SEND_METRICS: "false", NO_COLOR: "1" };
  for (const inst of Object.values(INSTANCES)) await assertPortFree(inst.port);
  if (!existsSync("dist/index.html")) {
    const b = spawnSync("npx", ["vite", "build"], { stdio: "inherit", env });
    if (b.status !== 0) throw new Error("vite build failed");
  }
  const mock = await startMock(MOCK_PORT);

  let inspector = 9310;
  await Promise.all(
    (Object.keys(INSTANCES) as InstanceName[]).map(async (name) => {
      const inst = INSTANCES[name];
      const dir = mkdtempSync(join(tmpdir(), `ac-${name}-`));
      dirs.push(dir);
      const mig = spawnSync("npx", ["wrangler", "d1", "migrations", "apply", "adlytic-check-db", "--local", "--persist-to", dir], { env, encoding: "utf8" });
      if (mig.status !== 0) throw new Error(`migrations failed for ${name}: ${mig.stderr}`);
      const varArgs = Object.entries(inst.vars).flatMap(([k, v]) => ["--var", `${k}:${v}`]);
      const p = spawn(
        "npx",
        ["wrangler", "dev", "--port", String(inst.port), "--ip", "127.0.0.1", "--persist-to", dir, "--inspector-port", String(inspector++), "--show-interactive-dev-session=false", ...varArgs],
        { env, stdio: ["ignore", "pipe", "pipe"], detached: true },
      );
      p.stdout?.on("data", () => {});
      p.stderr?.on("data", (d) => {
        const s = String(d);
        if (/error/i.test(s) && !/\[check\]|\[vision\]|\[turnstile\]/.test(s)) process.stderr.write(`[${name}] ${s}`);
      });
      procs.push(p);
      await waitFor(`${urlOf(name)}/api/health`, 90_000);
    }),
  );

  return async () => {
    for (const p of procs) {
      try {
        if (p.pid) process.kill(-p.pid, "SIGTERM"); // whole group: npx → wrangler → workerd
      } catch {
        p.kill("SIGTERM");
      }
    }
    mock.server.closeAllConnections();
    mock.server.close();
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  };
}
