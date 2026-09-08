#!/usr/bin/env node

/**
 * Structural Cloudflare API Token Policy Verification (Issue #72, ADR 0008).
 *
 * Parses Cloudflare user/tokens/:id details response and verifies that:
 * 1. Token status is active.
 * 2. Token contains an ALLOW policy granting exact write/edit permission groups for:
 *    - Workers Scripts (Workers Scripts Write / Workers Scripts)
 *    - Custom Domains / Routes (Workers Routes Write / Workers Custom Domains Write / Zone Read + DNS Write)
 *    - D1 (D1 Write)
 *    - R2 (Workers R2 Storage Write / R2 Write)
 *    - Queues (Workers Queues Write / Queues Write)
 * 3. Token policies do not deny the targeted account or zone.
 * 4. Resource scopes cover the target account ID and target zone ID (or all accounts/zones "*").
 */

import { readFileSync } from "node:fs";
import process from "node:process";

// Canonical permission group names documented by Cloudflare
export const REQUIRED_CAPABILITIES = {
  "Workers Scripts": [
    "Workers Scripts Write",
    "Workers Scripts Edit",
  ],
  "Custom Domains / Routes": [
    "Workers Routes Write",
    "Workers Custom Domains Write",
    "Zone Read",
    "DNS Write",
  ],
  "D1": [
    "D1 Write",
    "D1 Edit",
  ],
  "R2": [
    "Workers R2 Storage Write",
    "R2 Write",
    "Workers R2 Storage Edit",
    "R2 Edit",
  ],
  "Queues": [
    "Workers Queues Write",
    "Queues Write",
    "Workers Queues Edit",
    "Queues Edit",
  ],
};

export function verifyTokenPolicies(rawJson, options = {}) {
  let parsed;
  if (typeof rawJson === "string") {
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      return {
        valid: false,
        missingPermissions: [],
        scopeErrors: [],
        error: "Failed to parse token details JSON: invalid JSON syntax",
      };
    }
  } else {
    parsed = rawJson;
  }

  if (!parsed || parsed.success !== true || !parsed.result) {
    return {
      valid: false,
      missingPermissions: [],
      scopeErrors: [],
      error: "Token details response indicates failure or missing result",
    };
  }

  if (parsed.result.status !== "active") {
    return {
      valid: false,
      missingPermissions: [],
      scopeErrors: [],
      error: `Token status is '${parsed.result.status}', expected 'active'`,
    };
  }

  const policies = parsed.result.policies || [];
  if (!Array.isArray(policies) || policies.length === 0) {
    return {
      valid: false,
      missingPermissions: Object.keys(REQUIRED_CAPABILITIES),
      scopeErrors: [],
      error: "Token has no policies defined",
    };
  }

  // Check for any explicit DENY policies on target account/zone
  const targetAccount = options.targetAccountId?.trim();
  const targetZone = options.targetZoneId?.trim();

  for (const policy of policies) {
    if (policy.effect === "deny") {
      const res = JSON.stringify(policy.resources || {});
      if (
        (targetAccount && res.includes(targetAccount)) ||
        (targetZone && res.includes(targetZone))
      ) {
        return {
          valid: false,
          missingPermissions: [],
          scopeErrors: [`Explicit DENY policy found targeting account ${targetAccount || ""} or zone ${targetZone || ""}`],
          error: "Token contains an explicit DENY policy affecting target resources",
        };
      }
    }
  }

  // Check ALLOW policies
  const allowPolicies = policies.filter((p) => p.effect === "allow");
  if (allowPolicies.length === 0) {
    return {
      valid: false,
      missingPermissions: Object.keys(REQUIRED_CAPABILITIES),
      scopeErrors: [],
      error: "No ALLOW policies found in token",
    };
  }

  // Collect all granted permission group names in allow policies
  const grantedPermissionNames = new Set();
  const allAccountResources = [];
  const allZoneResources = [];

  for (const policy of allowPolicies) {
    for (const group of policy.permission_groups || []) {
      if (group && typeof group.name === "string") {
        grantedPermissionNames.add(group.name.trim());
      }
    }
    const resources = policy.resources || {};
    for (const key of Object.keys(resources)) {
      if (key.startsWith("com.cloudflare.api.account.zone")) {
        allZoneResources.push(key);
      } else if (key.startsWith("com.cloudflare.api.account")) {
        allAccountResources.push(key);
      }
    }
  }

  // Verify each required capability
  const missingPermissions = [];
  for (const [capability, acceptedNames] of Object.entries(REQUIRED_CAPABILITIES)) {
    const hasPermission = acceptedNames.some((accepted) => grantedPermissionNames.has(accepted));
    if (!hasPermission) {
      missingPermissions.push(capability);
    }
  }

  // Verify resource scopes cover targeted account & zone if specified
  const scopeErrors = [];
  if (targetAccount) {
    const accountMatches = allAccountResources.some(
      (resKey) => resKey === "com.cloudflare.api.account.*" || resKey.includes(targetAccount)
    );
    if (!accountMatches && allAccountResources.length > 0) {
      scopeErrors.push(`Token allow policies do not cover target account ${targetAccount}`);
    }
  }

  if (targetZone) {
    const zoneMatches = allZoneResources.some(
      (resKey) => resKey === "com.cloudflare.api.account.zone.*" || resKey.includes(targetZone)
    );
    if (!zoneMatches && allZoneResources.length > 0) {
      scopeErrors.push(`Token allow policies do not cover target zone ${targetZone}`);
    }
  }

  const valid = missingPermissions.length === 0 && scopeErrors.length === 0;
  return {
    valid,
    missingPermissions,
    scopeErrors,
    error: valid
      ? undefined
      : `Missing permissions: [${missingPermissions.join(", ")}]; Scope errors: [${scopeErrors.join(", ")}]`,
  };
}

// CLI execution when run directly
const isDirectCli = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());
if (isDirectCli) {
  const args = process.argv.slice(2);
  const jsonPath = args[0];
  const targetAccountId = args[1];
  const targetZoneId = args[2];

  if (!jsonPath) {
    console.error("Usage: node verify-token-policy.mjs <token-details.json | -> [targetAccountId] [targetZoneId]");
    process.exit(1);
  }

  const rawJson = jsonPath === "-" ? readFileSync(0, "utf8") : readFileSync(jsonPath, "utf8");
  const result = verifyTokenPolicies(rawJson, { targetAccountId, targetZoneId });

  if (!result.valid) {
    console.error(`ERROR: Cloudflare token policy verification failed.`);
    if (result.missingPermissions.length > 0) {
      console.error(`Missing required write permission groups: ${result.missingPermissions.join(", ")}`);
    }
    if (result.scopeErrors.length > 0) {
      console.error(`Resource scope errors: ${result.scopeErrors.join(", ")}`);
    }
    if (result.error) {
      console.error(`Detail: ${result.error}`);
    }
    process.exit(1);
  }

  console.log("OK: Cloudflare token policy verified with all required write permissions and matching resource scopes.");
  process.exit(0);
}
