import { readFile } from "node:fs/promises";
import semver from "semver";

/**
 * Mirror DSH's own install-time gate: DSH compares its runtime version with
 * every `@deepseek-ai/dsh` / `@deepseek-ai/dsh-*` peer range and refuses the
 * plugin when one of them does not satisfy it, using
 * `semver.satisfies(runtime, range, { includePrerelease: true })`.
 *
 * Usage: node scripts/check-dsh-compat.mjs <dsh-version> [more versions...]
 */

const versions = process.argv.slice(2);
if (versions.length === 0) throw new Error("usage: check-dsh-compat.mjs <dsh-version> [more versions...]");

const project = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const peers = Object.entries(project.peerDependencies ?? {})
  .filter(([name]) => name === "@deepseek-ai/dsh" || name.startsWith("@deepseek-ai/dsh-"))
  .map(([name, range]) => [name, range]);

if (peers.length === 0) throw new Error("package.json declares no @deepseek-ai/dsh peers");

let failed = false;
for (const version of versions) {
  if (!semver.valid(version)) throw new Error(`invalid DSH version ${JSON.stringify(version)}`);
  const rejected = peers.filter(([, range]) => !semver.satisfies(version, range, { includePrerelease: true }));
  if (rejected.length > 0) {
    failed = true;
    for (const [name, range] of rejected) {
      console.error(`DSH ${version}: ${name} peer range ${JSON.stringify(range)} rejects it`);
    }
    continue;
  }
  console.log(`DSH ${version}: ${peers.length} peer contracts accepted`);
}

if (failed) process.exitCode = 1;
