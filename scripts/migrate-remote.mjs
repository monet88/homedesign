import fs from "node:fs";
import { spawn } from "node:child_process";

// Read token
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
  console.error("ERROR: No token found");
  process.exit(1);
}

console.log("==> Applying D1 migrations on remote database 'homeds' (--env demo)...");

const child = spawn("npx.cmd", ["wrangler", "d1", "migrations", "apply", "homeds", "--remote", "--env", "demo"], {
  shell: true,
  env: {
    ...process.env,
    CLOUDFLARE_API_TOKEN: token,
  },
  stdio: "inherit",
});

child.on("close", (code) => {
  if (code === 0) {
    console.log("\n==> D1 REMOTE MIGRATIONS APPLIED SUCCESSFULLY!");
  } else {
    console.error(`\n==> MIGRATION FAILED with code ${code}`);
    process.exit(code ?? 1);
  }
});
