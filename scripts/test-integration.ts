#!/usr/bin/env bun
/**
 * Integration test runner — spins up Docker services, waits for health,
 * runs bun test tests/integration/, then tears down.
 */

const SERVICES = ["postgres", "mysql", "mssql"] as const;
type Service = (typeof SERVICES)[number];

const ENV: Record<Service, [string, string]> = {
  postgres: ["SQUN_PG_URL", "postgresql://postgres:password@localhost:5432/squn_test"],
  mysql: ["SQUN_MYSQL_URL", "mysql://root:password@localhost:3306/squn_test"],
  mssql: ["SQUN_MSSQL_URL", "mssql://sa:Password123!@localhost:1433/master"],
};

function run(cmd: string, env?: Record<string, string>): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const proc = Bun.spawn(cmd.split(" "), {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...env },
    });
    Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]).then(([stdout, stderr]) => {
      proc.exited.then((code) => resolve({ code: code ?? 1, out: stdout + stderr }));
    });
  });
}

async function waitForHealthy(maxWaitMs = 300_000): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  const remaining = new Set<Service>(SERVICES);

  console.log("\nWaiting for containers to be healthy...");

  while (remaining.size > 0 && Date.now() < deadline) {
    const { out } = await run("docker compose ps --format json");

    for (const line of out.split("\n").filter(Boolean)) {
      let parsed: { Service?: string; Health?: string; Name?: string } = {};
      try {
        parsed = JSON.parse(line) as typeof parsed;
      } catch {
        continue;
      }
      const name = (parsed.Service ?? parsed.Name ?? "").toLowerCase() as Service;
      const health = (parsed.Health ?? "").toLowerCase();
      if (remaining.has(name) && health === "healthy") {
        console.log(`  ✓ ${name} is healthy`);
        remaining.delete(name);
      }
    }

    if (remaining.size > 0) {
      await Bun.sleep(2000);
    }
  }

  if (remaining.size > 0) {
    throw new Error(`Timed out waiting for: ${[...remaining].join(", ")}`);
  }
}

async function main(): Promise<void> {
  console.log("Starting Docker services...");
  const up = await run("docker compose up -d");
  if (up.code !== 0) {
    console.error(up.out);
    process.exit(1);
  }

  try {
    await waitForHealthy();

    const testEnv: Record<string, string> = {};
    for (const [envKey, envVal] of Object.values(ENV)) {
      testEnv[envKey] = envVal;
    }

    console.log("\nRunning integration tests...\n");

    const result = Bun.spawn(
      ["bun", "test", "tests/integration/"],
      {
        stdout: "inherit",
        stderr: "inherit",
        env: { ...process.env, ...testEnv },
      },
    );
    const code = await result.exited;

    console.log(code === 0 ? "\n  All integration tests passed." : "\n  Some tests failed.");
    process.exitCode = code ?? 0;
  } finally {
    console.log("\nTearing down Docker services...");
    await run("docker compose down");
    console.log("  Done.");
  }
}

await main();
