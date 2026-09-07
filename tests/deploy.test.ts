// Deploy topology + workflow structure tests (ticket #18).
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..");

function read(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("wrangler environment isolation (ADR 0006)", () => {
  const wrangler = read("wrangler.jsonc");

  it("pins compatibility_date", () => {
    expect(wrangler).toMatch(/"compatibility_date":\s*"2026-08-24"/);
  });

  it("declares deployed environments with distinct resource names", () => {
    for (const env of ["development", "preview", "staging", "production", "demo"] as const) {
      expect(wrangler).toContain(`"${env}"`);
    }
    expect(wrangler).toMatch(/"database_name":\s*"hd-dev"/);
    expect(wrangler).toMatch(/"database_name":\s*"hd-staging"/);
    expect(wrangler).toMatch(/"database_name":\s*"hd-prod"/);
    expect(wrangler).toMatch(/"database_name":\s*"hd-demo"/);
  });

  it("remote environments use provisioned placeholders, not shared local id", () => {
    for (const marker of ["__PROVISIONED_DEV__", "__PROVISIONED_STAGING__", "__PROVISIONED_PROD__", "__PROVISIONED_DEMO__"]) {
      expect(wrangler).toContain(marker);
    }
    const remoteSection = wrangler.split('"env"')[1] ?? "";
    expect(remoteSection).not.toContain('"database_id": "local"');
  });

  it("production sets ENVIRONMENT=production and non-test email mode", () => {
    expect(wrangler).toMatch(/"ENVIRONMENT":\s*"production"/);
    expect(wrangler).toMatch(/"EMAIL_DELIVERY_MODE":\s*"production"/);
    const prodBlock = wrangler.split('"production"')[1] ?? "";
    expect(prodBlock).not.toMatch(/AUTH_BYPASS["\s:]*[1t]/i);
  });

  it("demo sets ENVIRONMENT=demo and Custom Domain route", () => {
    expect(wrangler).toMatch(/"ENVIRONMENT":\s*"demo"/);
    expect(wrangler).toMatch(/"BETTER_AUTH_URL":\s*"https:\/\/homedesign\.monet\.uno"/);
    expect(wrangler).toMatch(/"pattern":\s*"homedesign\.monet\.uno"/);
    expect(wrangler).toMatch(/"custom_domain":\s*true/);
    const demoBlock = wrangler.split('"demo"')[1] ?? "";
    expect(demoBlock).not.toMatch(/AUTH_BYPASS["\s:]*[1t]/i);
  });

  it("documents required secret names in wrangler comments (no values committed)", () => {
    expect(wrangler).toContain("BETTER_AUTH_SECRET");
    expect(wrangler).toContain("R2_ACCESS_KEY_ID");
    expect(wrangler).not.toMatch(/sk_live_/);
  });

  it("uses custom worker entry with queue consumers and scheduled reconciler", () => {
    expect(wrangler).toMatch(/"main":\s*"worker\.ts"/);
    expect(wrangler).toContain('"consumers"');
    expect(wrangler).toContain("homedesign-asset-validate");
    expect(wrangler).toContain("homedesign-provider-notify");
    expect(wrangler).toMatch(/"crons"/);
  });
});

describe("GitHub Actions workflows", () => {
  const dir = join(ROOT, ".github", "workflows");
  const files = readdirSync(dir).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));

  it.each(files)("%s uses ubuntu-latest and declares permissions", (file) => {
    const content = read(join(".github", "workflows", file));
    expect(content).toMatch(/runs-on:\s*ubuntu-latest/);
    expect(content).toMatch(/^permissions:/m);
  });

  it("includes preview lifecycle workflows", () => {
    expect(files).toEqual(
      expect.arrayContaining([
        "ci.yml",
        "preview-provision.yml",
        "preview-destroy.yml",
        "preview-janitor.yml",
        "staging-smoke.yml",
      ])
    );
  });

  it("preview provision references PR number and no-ops without secrets", () => {
    const provision = read(".github/workflows/preview-provision.yml");
    expect(provision).toContain("pull_request:");
    expect(provision).toContain("CLOUDFLARE_PREVIEW_API_TOKEN");
    expect(read("scripts/preview-provision.sh")).toContain("SKIP:");
  });

  it("janitor workflow is scheduled", () => {
    expect(read(".github/workflows/preview-janitor.yml")).toMatch(/schedule:/);
  });
});

describe("smoke script", () => {
  it("uses the cross-platform runner behind the POSIX wrapper", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const wrapper = read("scripts/smoke.sh");

    expect(packageJson.scripts?.smoke).toBe("node scripts/smoke.mjs");
    expect(wrapper).toContain("exec node scripts/smoke.mjs");
  });
});

describe("e2e runner", () => {
  it("isolates the default admin per run and forwards Playwright args without a shell", () => {
    const runner = read("scripts/run-e2e.mjs");

    expect(runner).toContain("e2e-admin-${Date.now()}");
    expect(runner).toContain("...process.argv.slice(2)");
    expect(runner).toContain('runCommand("npx", playwrightArgs');
    expect(runner).not.toContain("shell: true");
  });
});

describe("free-first gate script", () => {
  it("uses the cross-platform runner, documents CPU ≤10ms, and checks 3MB bundle", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      scripts?: Record<string, string>;
    };
    const wrapper = read("scripts/free-first-gate.sh");
    const gate = read("scripts/free-first-gate.mjs");

    expect(packageJson.scripts?.["gate:free-first"]).toBe(
      "node scripts/free-first-gate.mjs"
    );
    expect(wrapper).toContain("exec node scripts/free-first-gate.mjs");
    expect(gate).toContain("10ms");
    expect(gate).toMatch(/3 \* 1024 \* 1024/);
    expect(gate).toContain('"wrangler", "deploy", "--dry-run"');
    expect(gate).toContain("Total Upload:");
  });
});

describe("demo-provision script (ADR 0008 / Issue #72)", () => {
  it("implements capability preflight, idempotent creation, CORS, dry-run and secret guards", () => {
    const script = read("scripts/demo-provision.sh");

    expect(script).toContain("CLOUDFLARE_API_TOKEN");
    expect(script).toContain("npx wrangler whoami");
    expect(script).toContain("npx wrangler d1 list");
    expect(script).toContain("npx wrangler r2 bucket list");
    expect(script).toContain("npx wrangler queues list");
    expect(script).toContain("hd-demo-private");
    expect(script).toContain("https://homedesign.monet.uno");
    expect(script).toContain("--dry-run");
    expect(script).toContain("npm run build:worker");
    expect(script).toContain("npm run gate:free-first");
    expect(script).not.toContain("password");
  });
});

describe("playwright config (Issue #72)", () => {
  it("supports remote demo base-URL override, disables webServer remotely, and supports runtime storage state", () => {
    const config = read("playwright.config.ts");

    expect(config).toContain("process.env.PLAYWRIGHT_BASE_URL");
    expect(config).toContain("process.env.DEMO_BASE_URL");
    expect(config).toContain("process.env.PLAYWRIGHT_STORAGE_STATE");
    expect(config).toContain("storageState: authStorageState || undefined");
    expect(config).toMatch(/webServer:\s*isRemote\s*\?\s*undefined/);
  });
});
