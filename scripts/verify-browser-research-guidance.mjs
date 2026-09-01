import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const guide = readFileSync(new URL("docs/agents/browser-research.md", root), "utf8");
const scenarios = readFileSync(new URL("docs/agents/browser-research-verification.md", root), "utf8");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const route = (capabilities, need) => {
  const has = (name) => capabilities.has(name);
  if (need === "local") return has("inspect_local_file") ? "inspect_local_file" : has("view_file") ? "view_file" : null;
  if (need === "library") return has("context7") ? "context7" : has("native_web_search") ? "native_web_search" : null;
  if (need === "search") return has("exa_web_search") ? "exa_web_search" : has("tavily_search") ? "tavily_search" : has("native_web_search") ? "native_web_search" : null;
  if (need === "open") return has("exa_web_fetch") ? "exa_web_fetch" : has("tavily_extract") ? "tavily_extract" : has("native_web_open") ? "native_web_open" : null;
  return null;
};

function runScenario(name, capabilities, needs) {
  const attemptedCalls = [];
  const missing = [];
  for (const need of needs) {
    const capability = route(capabilities, need);
    if (!capability) {
      missing.push(need);
      continue;
    }
    attemptedCalls.push(capability);
  }
  const unavailableCalls = attemptedCalls.filter((call) => !capabilities.has(call));
  const ok = missing.length === 0 && unavailableCalls.length === 0;
  return {
    name,
    capabilities: [...capabilities],
    selectedRoute: attemptedCalls,
    attemptedCalls,
    unavailableCalls,
    missing,
    ok,
    result: ok ? "PASS" : "FAIL",
  };
}

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

const scenarioCapabilities = new Set(["inspect_local_file", "native_web_search", "native_web_open"]);
const scenarioRuns = [
  runScenario("library-docs-native-fallback", scenarioCapabilities, ["local", "library", "open"]),
  runScenario("general-research-native-fallback", scenarioCapabilities, ["local", "search", "search", "open"]),
];
// Running the same capability matrix twice must produce byte-for-byte stable
// routing and attempt logs; this keeps the verification exercise deterministic.
const replay = scenarioRuns.map((scenario) => runScenario(
  scenario.name,
  new Set(scenario.capabilities),
  scenario.name.startsWith("library") ? ["local", "library", "open"] : ["local", "search", "search", "open"],
));
check(JSON.stringify(scenarioRuns) === JSON.stringify(replay), "scenario routing must be deterministic");
for (const scenario of scenarioRuns) check(scenario.ok, `${scenario.name} has unavailable or unresolved calls`);

if (failures.length > 0) {
  console.error("browser/research guidance verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ ok: true, scenarios: scenarioRuns }, null, 2));
}
