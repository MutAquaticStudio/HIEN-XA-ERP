import { execFileSync } from "node:child_process";

const keepCount = 2;
const confirm = process.argv.includes("--confirm");
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function runEas(argumentsList) {
  return execFileSync(npxCommand, ["eas-cli", ...argumentsList], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function completedAt(build) {
  return Date.parse(build.completedAt ?? build.updatedAt ?? build.createdAt ?? "") || 0;
}

const builds = JSON.parse(runEas(["build:list", "--platform", "android", "--limit", "100", "--json", "--non-interactive"]));
const internalBuilds = builds
  .filter((build) => build.status === "FINISHED" && build.distribution === "INTERNAL")
  .sort((left, right) => completedAt(right) - completedAt(left));
const candidates = internalBuilds.slice(keepCount);

console.log(`Keeping ${Math.min(internalBuilds.length, keepCount)} newest finished internal Android build(s).`);
if (candidates.length === 0) {
  console.log("No old internal Android builds are eligible for deletion.");
  process.exit(0);
}

console.log("Eligible old builds:");
for (const build of candidates) {
  console.log(`- ${build.id} | ${build.appVersion ?? "unknown"} (${build.appBuildVersion ?? "unknown"}) | ${build.completedAt ?? build.updatedAt ?? "unknown date"}`);
}

if (!confirm) {
  console.log("Dry run only. Re-run with: npm run release:prune -- --confirm");
  process.exit(0);
}

for (const build of candidates) {
  runEas(["build:delete", build.id, "--non-interactive"]);
  console.log(`Deleted old build ${build.id}.`);
}
