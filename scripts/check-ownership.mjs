#!/usr/bin/env node
// Fails a pull request from branch mN/... if it changes files owned by someone else.
// Bypass: the owner of the touched files adds the label "cross-owner-approved".
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const map = JSON.parse(readFileSync(new URL("../OWNERS.json", import.meta.url), "utf8"));
const branch = process.env.BRANCH || execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
const base = process.env.BASE_SHA || `origin/${process.env.BASE_REF || "main"}`;
const labels = JSON.parse(process.env.LABELS || "[]");

const m = /^(m[1-4])\//.exec(branch);
if (!m) {
  console.log(`Branch "${branch}" is not an owner branch (m1/... to m4/...). Skipping ownership check.`);
  process.exit(0);
}
const me = m[1];

function toRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") { i++; re += "(?:.*/)?"; } else { re += ".*"; }
      } else { re += "[^/]*"; }
    } else if (".+?^${}()|[]\\".includes(c)) { re += "\\" + c; }
    else { re += c; }
  }
  return new RegExp("^" + re + "$");
}
const compiled = Object.fromEntries(
  Object.entries(map.owners).map(([k, v]) => [k, v.paths.map(toRegex)])
);
const open = map.open.map(toRegex);

const files = execSync(`git diff --name-only ${base}...HEAD`).toString().split("\n").filter(Boolean);
const problems = [];
for (const f of files) {
  if (compiled[me].some((r) => r.test(f)) || open.some((r) => r.test(f))) continue;
  const owner = Object.keys(compiled).find((k) => compiled[k].some((r) => r.test(f)));
  problems.push(owner ? `${f}  (owned by ${map.owners[owner].name})` : `${f}  (unowned: ask M4 to add it to OWNERS.json)`);
}

if (problems.length === 0) {
  console.log(`Ownership check passed for ${me}: ${files.length} changed file(s), all in your area.`);
  process.exit(0);
}
if (labels.includes("cross-owner-approved")) {
  console.log("Cross-owner changes allowed by label 'cross-owner-approved':\n" + problems.join("\n"));
  process.exit(0);
}
console.error(`Ownership check FAILED for ${me}. These files are outside your area:\n` + problems.map((p) => " - " + p).join("\n"));
console.error("\nAsk the owner to make the change, or have the owner approve this PR and add the label 'cross-owner-approved'.");
process.exit(1);
