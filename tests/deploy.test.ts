// Deploy topology + workflow structure tests (ticket #18).
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
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

  it("demo sets ENVIRONMENT=demo, DEMO_DAILY_PROVIDER_LIMIT=50, and Custom Domain route", () => {
    expect(wrangler).toMatch(/"ENVIRONMENT":\s*"demo"/);
    expect(wrangler).toMatch(/"BETTER_AUTH_URL":\s*"https:\/\/homedesign\.monet\.uno"/);
    expect(wrangler).toMatch(/"DEMO_DAILY_PROVIDER_LIMIT":\s*"50"/);
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
  it("implements capability preflight, idempotent creation, CORS, dry-run, secret injection, and strict verification", () => {
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
    expect(script).toContain("npx wrangler secret put");
    expect(script).not.toMatch(/r2 bucket cors set .* \|\| true/);
    expect(script).toContain("DEPLOYMENT_OK");
    expect(script).not.toContain("password");
  });

  it("implements authoritative non-mutating capability preflights for token policies, zone, D1, R2, Queues before any mutation", () => {
    const script = read("scripts/demo-provision.sh");

    // Token self-verification and authoritative policy introspection
    expect(script).toContain("user/tokens/verify");
    expect(script).toContain("user/tokens/${TOKEN_ID}");
    expect(script).toContain("User: API Tokens: Read");
    expect(script).toContain("verify-token-policy.mjs");

    // Zone capability check
    expect(script).toContain("zones?name=monet.uno");

    // Never masks deployment checks with || true
    expect(script).not.toMatch(/deployments list/);

    // Never prints the token
    expect(script).not.toContain("echo \"$CLOUDFLARE_API_TOKEN\"");
    expect(script).not.toContain("echo \"${CLOUDFLARE_API_TOKEN}\"");
  });

  it("proves verify-token-policy rejects read-only permissions, missing groups, wrong resource scopes, and accepts valid write tokens", () => {
    const verifyScriptPath = join(ROOT, "scripts/verify-token-policy.mjs");
    const targetAccount = "acct_target_123456";
    const targetZone = "zone_target_789012";

    // 1. Valid Token with all required write groups directly bound to target account/zone scopes -> SUCCEEDS (exit 0)
    const validToken = {
      success: true,
      result: {
        id: "tok_valid",
        name: "homedesign-deploy-token",
        status: "active",
        policies: [
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.${targetAccount}`]: "*",
            },
            permission_groups: [
              { name: "Workers Scripts Write" },
              { name: "D1 Write" },
              { name: "Workers R2 Storage Write" },
              { name: "Workers Queues Write" },
            ],
          },
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.zone.${targetZone}`]: "*",
            },
            permission_groups: [
              { name: "Zone Read" },
            ],
          },
        ],
      },
    };
    const validRes = spawnSync("node", [verifyScriptPath, "-", targetAccount, targetZone], {
      input: JSON.stringify(validToken),
      encoding: "utf8",
    });
    expect(validRes.status).toBe(0);
    expect(validRes.stdout).toContain("OK: Cloudflare token policy verified");

    // 2. Write on wrong account + unrelated target-scope policy -> FAILS (exit 1)
    // The policy covering targetAccount only has an unrelated permission (e.g. Audit Logs Read),
    // while the write permissions are scoped to a different account.
    const decoupledToken = {
      success: true,
      result: {
        id: "tok_decoupled",
        name: "decoupled-token",
        status: "active",
        policies: [
          {
            effect: "allow",
            resources: {
              "com.cloudflare.api.account.unrelated_account_999": "*",
            },
            permission_groups: [
              { name: "Workers Scripts Write" },
              { name: "D1 Write" },
              { name: "Workers R2 Storage Write" },
              { name: "Workers Queues Write" },
            ],
          },
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.${targetAccount}`]: "*",
            },
            permission_groups: [
              { name: "Audit Logs Read" },
            ],
          },
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.zone.${targetZone}`]: "*",
            },
            permission_groups: [
              { name: "Zone Read" },
            ],
          },
        ],
      },
    };
    const decoupledRes = spawnSync("node", [verifyScriptPath, "-", targetAccount, targetZone], {
      input: JSON.stringify(decoupledToken),
      encoding: "utf8",
    });
    expect(decoupledRes.status).toBe(1);
    expect(decoupledRes.stderr).toContain("Missing required write permission groups: Workers Scripts, D1, R2, Queues");

    // 3. Zone Read alone without Workers Scripts Write -> FAILS (exit 1)
    const zoneOnlyToken = {
      success: true,
      result: {
        id: "tok_zone_only",
        name: "zone-only-token",
        status: "active",
        policies: [
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.zone.${targetZone}`]: "*",
            },
            permission_groups: [
              { name: "Zone Read" },
            ],
          },
        ],
      },
    };
    const zoneOnlyRes = spawnSync("node", [verifyScriptPath, "-", targetAccount, targetZone], {
      input: JSON.stringify(zoneOnlyToken),
      encoding: "utf8",
    });
    expect(zoneOnlyRes.status).toBe(1);
    expect(zoneOnlyRes.stderr).toContain("Missing required write permission groups: Workers Scripts, D1, R2, Queues");
    expect(zoneOnlyRes.stderr).toContain(`Resource scope errors: Token allow policies do not cover target account ${targetAccount}`);

    // 4. No account scope -> FAILS (exit 1)
    const noAccountScopeToken = {
      success: true,
      result: {
        id: "tok_no_acct_scope",
        name: "no-acct-scope",
        status: "active",
        policies: [
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.zone.${targetZone}`]: "*",
            },
            permission_groups: [
              { name: "Zone Read" },
            ],
          },
        ],
      },
    };
    const noAccountRes = spawnSync("node", [verifyScriptPath, "-", targetAccount, targetZone], {
      input: JSON.stringify(noAccountScopeToken),
      encoding: "utf8",
    });
    expect(noAccountRes.status).toBe(1);
    expect(noAccountRes.stderr).toContain(`Token allow policies do not cover target account ${targetAccount}`);

    // 5. No zone scope -> FAILS (exit 1)
    const noZoneScopeToken = {
      success: true,
      result: {
        id: "tok_no_zone_scope",
        name: "no-zone-scope",
        status: "active",
        policies: [
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.${targetAccount}`]: "*",
            },
            permission_groups: [
              { name: "Workers Scripts Write" },
              { name: "D1 Write" },
              { name: "Workers R2 Storage Write" },
              { name: "Workers Queues Write" },
            ],
          },
        ],
      },
    };
    const noZoneRes = spawnSync("node", [verifyScriptPath, "-", targetAccount, targetZone], {
      input: JSON.stringify(noZoneScopeToken),
      encoding: "utf8",
    });
    expect(noZoneRes.status).toBe(1);
    expect(noZoneRes.stderr).toContain(`Missing required write permission groups: Zone`);
    expect(noZoneRes.stderr).toContain(`Token allow policies do not cover target zone ${targetZone}`);

    // 6. Read-Only names -> FAILS (exit 1) and lists missing write groups
    const readOnlyToken = {
      success: true,
      result: {
        id: "tok_readonly",
        name: "readonly-token",
        status: "active",
        policies: [
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.${targetAccount}`]: "*",
            },
            permission_groups: [
              { name: "Workers Scripts Read" },
              { name: "D1 Read" },
              { name: "Workers R2 Storage Read" },
              { name: "Workers Queues Read" },
            ],
          },
          {
            effect: "allow",
            resources: {
              [`com.cloudflare.api.account.zone.${targetZone}`]: "*",
            },
            permission_groups: [
              { name: "Zone Read" },
            ],
          },
        ],
      },
    };
    const readOnlyRes = spawnSync("node", [verifyScriptPath, "-", targetAccount, targetZone], {
      input: JSON.stringify(readOnlyToken),
      encoding: "utf8",
    });
    expect(readOnlyRes.status).toBe(1);
    expect(readOnlyRes.stderr).toContain("Missing required write permission groups: Workers Scripts, D1, R2, Queues");

    // 7. Malformed policy structures -> FAILS (exit 1)
    const malformedToken = {
      success: true,
      result: {
        id: "tok_malformed",
        name: "malformed-token",
        status: "active",
        policies: ["not-an-object"],
      },
    };
    const malformedRes = spawnSync("node", [verifyScriptPath, "-", targetAccount, targetZone], {
      input: JSON.stringify(malformedToken),
      encoding: "utf8",
    });
    expect(malformedRes.status).toBe(1);
    expect(malformedRes.stderr).toContain("Malformed policy structure");

    // 8. Inactive or disabled token -> FAILS (exit 1)
    const inactiveToken = {
      success: true,
      result: {
        id: "tok_inactive",
        name: "inactive-token",
        status: "disabled",
        policies: validToken.result.policies,
      },
    };
    const inactiveRes = spawnSync("node", [verifyScriptPath, "-", targetAccount, targetZone], {
      input: JSON.stringify(inactiveToken),
      encoding: "utf8",
    });
    expect(inactiveRes.status).toBe(1);
    expect(inactiveRes.stderr).toContain("Token status is 'disabled', expected 'active'");
  });
});

describe("demo admin bootstrap CLI (ADR 0008, Issue #72)", () => {
  it("unambiguously targets remote hd-demo, implies --remote, and checks user before promotion", () => {
    const seedScript = read("scripts/seed-admin.mjs");
    const provScript = read("scripts/demo-provision.sh");

    // --demo implies --remote and dbName hd-demo
    expect(seedScript).toContain("isDemo = process.argv.includes(\"--demo\")");
    expect(seedScript).toContain("isRemote = process.argv.includes(\"--remote\") || (isDemo && !process.argv.includes(\"--local\"))");
    expect(seedScript).toContain("dbName = isDemo ? (isRemote ? \"hd-demo\" : \"homedesign\") : \"homedesign\"");

    // Queries existing Google account before UPDATE
    expect(seedScript).toContain("SELECT id, role FROM user WHERE email");
    expect(seedScript).toContain("Admin must sign in with Google first");

    // Role-only UPDATE, no passwords, no credit ledger grants in demo branch
    expect(seedScript).toContain("UPDATE user SET role = 'admin'");
    expect(provScript).toContain("node scripts/seed-admin.mjs --demo --remote");
  });

  it("fails closed with exit code 1 when Google user has not yet signed in", () => {
    const res = spawnSync("node", ["scripts/seed-admin.mjs", "--demo", "--local"], {
      cwd: ROOT,
      env: {
        ...process.env,
        ADMIN_EMAIL: "completely-nonexistent-user@example.com",
      },
      encoding: "utf8",
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("Admin must sign in with Google first");
  });
});

describe("playwright config and public-demo harness (Issue #72)", () => {
  it("supports remote demo base-URL override, disables webServer remotely, and supports runtime storage state", () => {
    const config = read("playwright.config.ts");

    expect(config).toContain("process.env.PLAYWRIGHT_BASE_URL");
    expect(config).toContain("process.env.DEMO_BASE_URL");
    expect(config).toContain("process.env.PLAYWRIGHT_STORAGE_STATE");
    expect(config).toContain("storageState: authStorageState || undefined");
    expect(config).toMatch(/webServer:\s*isRemote\s*\?\s*undefined/);
  });

  it("declares public demo journey covering real R2 intake PUT, Interior, Exterior, Floor Plan with Panorama, settlement, denial, and share", () => {
    const demoJourney = read("e2e/public-demo-journey.spec.ts");

    expect(demoJourney).toContain("PLAYWRIGHT_STORAGE_STATE");
    expect(demoJourney).toContain("upload-intent");
    expect(demoJourney).toContain("request.put");
    expect(demoJourney).toContain("finalize");
    expect(demoJourney).toContain("/ai-interior-design");
    expect(demoJourney).toContain("/ai-exterior-design");
    expect(demoJourney).toContain("/ai-floor-plan");
    expect(demoJourney).toContain("Brief");
    expect(demoJourney).toContain("Layout");
    expect(demoJourney).toContain("Render");
    expect(demoJourney).toContain("Panorama");
    expect(demoJourney).toContain("creditsBefore.available - 1");
    expect(demoJourney).toContain("creditsBefore.available - 10");
    expect(demoJourney).toContain("Unauthorized Private Asset Access Denial");
    expect(demoJourney).toContain("type=generated&lifecycle=ready");
    expect(demoJourney).toContain("projectId=${encodeURIComponent(project.id)}");
    expect(demoJourney).toContain("assetIds: [chosenAsset.id]");
    expect(demoJourney).toContain("/assets/${chosenAsset.id}");
  });
});
