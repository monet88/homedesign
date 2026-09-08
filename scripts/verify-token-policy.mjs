#!/usr/bin/env node

/**
 * Structural Cloudflare API Token Policy Verification (Issue #72, ADR 0008).
 *
 * Parses Cloudflare user/tokens/:id details response and verifies that:
 * 1. Target Account ID and Target Zone ID are provided and non-empty.
 * 2. Token status is active.
 * 3. Token policies do not deny the targeted account or zone.
 * 4. Token contains ALLOW policies that bind each required capability directly
 *    to an enclosing resource scope covering the target resource:
 *    - Account-scoped capabilities (must cover target account):
 *      - "Workers Scripts" (Workers Scripts Write / Workers Scripts Edit)
 *      - "D1" (D1 Write / D1 Edit)
 *      - "R2" (Workers R2 Storage Write / R2 Write / Workers R2 Storage Edit / R2 Edit)
 *      - "Queues" (Workers Queues Write / Queues Write / Workers Queues Edit / Queues Edit)
 *    - Zone-scoped capabilities (must cover target zone):
 *      - "Zone" (Zone Read / Zone Write / Zone Edit)
 *
 * Permissions are NEVER decoupled from resource scopes: each capability must be
 * satisfied by an ALLOW policy whose resources actually cover the required scope.
 */

import { readFileSync } from "node:fs";
import process from "node:process";

// Required account-scoped capability definitions and canonical documented write/edit aliases
export const REQUIRED_ACCOUNT_CAPABILITIES = {
  "Workers Scripts": [
    "Workers Scripts Write",
    "Workers Scripts Edit",
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

// Required zone-scoped capability definitions
export const REQUIRED_ZONE_CAPABILITIES = {
  "Zone": [
    "Zone Read",
    "Zone Write",
    "Zone Edit",
  ],
};

function policyCoversAccount(resources, targetAccount) {
  if (!resources || typeof resources !== "object") return false;
  return Object.keys(resources).some((key) => {
    return (
      key === "com.cloudflare.api.account.*" ||
      key === `com.cloudflare.api.account.${targetAccount}`
    );
  });
}

function policyCoversZone(resources, targetZone) {
  if (!resources || typeof resources !== "object") return false;
  return Object.keys(resources).some((key) => {
    return (
      key === "com.cloudflare.api.account.zone.*" ||
      key === `com.cloudflare.api.account.zone.${targetZone}`
    );
  });
}

export function verifyTokenPolicies(rawJson, options = {}) {
  const targetAccount = options.targetAccountId?.trim();
  const targetZone = options.targetZoneId?.trim();

  // Fail closed if target account or zone ID is missing
  if (!targetAccount) {
    return {
      valid: false,
      missingPermissions: [],
      scopeErrors: ["Target account ID is required for verification"],
      error: "Missing required target account ID",
    };
  }

  if (!targetZone) {
    return {
      valid: false,
      missingPermissions: [],
      scopeErrors: ["Target zone ID is required for verification"],
      error: "Missing required target zone ID",
    };
  }

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

  const policies = parsed.result.policies;
  if (!Array.isArray(policies) || policies.length === 0) {
    return {
      valid: false,
      missingPermissions: [
        ...Object.keys(REQUIRED_ACCOUNT_CAPABILITIES),
        ...Object.keys(REQUIRED_ZONE_CAPABILITIES),
      ],
      scopeErrors: [],
      error: "Token has no policies defined",
    };
  }

  // Validate policy structure and check for DENY policies on target resources
  for (const policy of policies) {
    if (!policy || typeof policy !== "object") {
      return {
        valid: false,
        missingPermissions: [],
        scopeErrors: [],
        error: "Malformed policy structure: policy is not an object",
      };
    }
    if (policy.effect === "deny") {
      const res = JSON.stringify(policy.resources || {});
      if (res.includes(targetAccount) || res.includes(targetZone)) {
        return {
          valid: false,
          missingPermissions: [],
          scopeErrors: [`Explicit DENY policy found targeting account ${targetAccount} or zone ${targetZone}`],
          error: "Token contains an explicit DENY policy affecting target resources",
        };
      }
    }
  }

  const allowPolicies = policies.filter((p) => p.effect === "allow");
  if (allowPolicies.length === 0) {
    return {
      valid: false,
      missingPermissions: [
        ...Object.keys(REQUIRED_ACCOUNT_CAPABILITIES),
        ...Object.keys(REQUIRED_ZONE_CAPABILITIES),
      ],
      scopeErrors: [],
      error: "No ALLOW policies found in token",
    };
  }

  // Check account-scoped permissions: must be granted inside an ALLOW policy covering targetAccount
  const missingPermissions = [];
  const scopeErrors = [];

  for (const [capability, acceptedNames] of Object.entries(REQUIRED_ACCOUNT_CAPABILITIES)) {
    let satisfied = false;
    for (const policy of allowPolicies) {
      if (!policyCoversAccount(policy.resources, targetAccount)) {
        continue;
      }
      const groups = policy.permission_groups || [];
      const hasGroup = groups.some((g) => g && typeof g.name === "string" && acceptedNames.includes(g.name.trim()));
      if (hasGroup) {
        satisfied = true;
        break;
      }
    }
    if (!satisfied) {
      missingPermissions.push(capability);
    }
  }

  // Check zone-scoped permissions: must be granted inside an ALLOW policy covering targetZone
  for (const [capability, acceptedNames] of Object.entries(REQUIRED_ZONE_CAPABILITIES)) {
    let satisfied = false;
    for (const policy of allowPolicies) {
      if (!policyCoversZone(policy.resources, targetZone)) {
        continue;
      }
      const groups = policy.permission_groups || [];
      const hasGroup = groups.some((g) => g && typeof g.name === "string" && acceptedNames.includes(g.name.trim()));
      if (hasGroup) {
        satisfied = true;
        break;
      }
    }
    if (!satisfied) {
      missingPermissions.push(capability);
    }
  }

  // Check overall resource scope coverage evidence
  const hasAnyAccountScope = allowPolicies.some((p) => policyCoversAccount(p.resources, targetAccount));
  if (!hasAnyAccountScope) {
    scopeErrors.push(`Token allow policies do not cover target account ${targetAccount}`);
  }

  const hasAnyZoneScope = allowPolicies.some((p) => policyCoversZone(p.resources, targetZone));
  if (!hasAnyZoneScope) {
    scopeErrors.push(`Token allow policies do not cover target zone ${targetZone}`);
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
    console.error("Usage: node verify-token-policy.mjs <token-details.json | -> <targetAccountId> <targetZoneId>");
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
