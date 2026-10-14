import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const required = [
  "AGENTS.md",
  "PROJECT_CONTEXT.md",
  "docs/agent-workflow/WORKFLOW.md",
  "docs/agent-workflow/OWNERSHIP_AND_SECURITY.md",
  "docs/agent-workflow/VERIFICATION.md",
  "docs/agent-workflow/UI_UX_PRINCIPLES.md",
  "docs/agent-workflow/SKILLS.md",
];
const missing = required.filter((path) => {
  try {
    readFileSync(resolve(path));
    return false;
  } catch {
    return true;
  }
});
let context = "";
try {
  context = readFileSync(resolve("PROJECT_CONTEXT.md"), "utf8");
} catch {}
if (context.includes("[FILL IN:")) missing.push("PROJECT_CONTEXT.md (unresolved template markers)");
if (missing.length) {
  console.error("Agent workflow check failed:");
  for (const path of missing) console.error(`- ${path}`);
  process.exitCode = 1;
} else {
  console.log("Agent workflow check passed (required files present; no context markers).");
}
