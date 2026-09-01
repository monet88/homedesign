import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const guide = readFileSync(new URL("docs/agents/browser-research.md", root), "utf8");
const scenarios = readFileSync(new URL("docs/agents/browser-research-verification.md", root), "utf8");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

for (const capability of ["Browser interaction", "Library/API docs", "Known URL", "Web search", "Deeper research"]) {
  check(guide.includes(capability), `guide must define ${capability}`);
}
check(/Inspect the current runtime tool catalog/i.test(guide), "guide must require a capability check");
check(/Never call a missing provider/i.test(guide), "guide must prohibit unavailable-provider calls");
check(/local repository/i.test(guide) && /official reference/i.test(guide), "guide must preserve local-first and primary-source order");
check(/direct URL/i.test(guide), "guide must require direct citations");
check(scenarios.includes("Scenario 1") && scenarios.includes("Scenario 2"), "verification must cover both requested scenarios");
check(/no Context7, Exa, Tavily, or\s*`agent-browser` call is attempted/i.test(scenarios), "scenarios must prove provider-conditional fallback");
check(/native web search/i.test(scenarios), "scenarios must define a usable native fallback");

if (failures.length > 0) {
  console.error("browser/research guidance verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log("browser/research guidance verified (capability-conditional library and general-web scenarios)");
}
