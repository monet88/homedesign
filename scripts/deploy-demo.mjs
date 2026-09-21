import fs from "node:fs";
import { spawn } from "node:child_process";

// 1. Read CLOUDFLARE_WORKER_API from .env.local if not already set
let token = process.env.CLOUDFLARE_API_TOKEN;
if (!token && fs.existsSync(".env.local")) {
  const content = fs.readFileSync(".env.local", "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("CLOUDFLARE_WORKER_API=")) {
      token = trimmed.slice("CLOUDFLARE_WORKER_API=".length).trim().replace(/^["']|["']$/g, "");
      break;
    }
  }
}

if (!token) {
  console.error("ERROR: No CLOUDFLARE_API_TOKEN or CLOUDFLARE_WORKER_API found in environment or .env.local");
  process.exit(1);
}

console.log("==> Step 1: Building Cloudflare Worker bundle...");
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";

const buildChild = spawn(npmCmd, ["run", "build:worker"], {
  shell: true,
  stdio: "inherit",
});

buildChild.on("close", (buildCode) => {
  if (buildCode !== 0) {
    console.error(`ERROR: Worker build failed with exit code ${buildCode}`);
    process.exit(buildCode ?? 1);
  }

  console.log("\n==> Step 2: Cloudflare API Token detected. Initiating deployment to --env demo (design.7app.online)...");
  const child = spawn(npxCmd, ["opennextjs-cloudflare", "deploy", "--env", "demo"], {
    shell: true,
    env: {
      ...process.env,
      CLOUDFLARE_API_TOKEN: token,
      CLOUDFLARE_ENV: "demo",
      CI: "true",
    },
    stdio: "inherit",
  });

  child.on("close", (code) => {
    if (code === 0) {
      console.log("\n==> DEPLOYMENT SUCCESSFUL! Worker deployed to https://design.7app.online");
    } else {
      console.error(`\n==> DEPLOYMENT FAILED with exit code ${code}`);
      process.exit(code ?? 1);
    }
  });
});

