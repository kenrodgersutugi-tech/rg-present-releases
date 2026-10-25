#!/usr/bin/env node
/*
 * Publish a new version of RG-Present in one command, from the development machine:
 *
 *   npm run release 1.3.0            # or: npm run release -- 1.3.0 --notes "Fixed hymn 212"
 *
 * It bumps package.json, writes the version into CHANGELOG.md if it is not there yet, commits,
 * tags `v1.3.0` and pushes. Pushing the tag starts the Release workflow, which builds the Windows
 * installer and the content packs on a GitHub runner and publishes them with updates.json — which
 * is what every church computer reads, so nothing else needs doing.
 *
 * Add --dry-run to see the commands without running anything.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const notesIdx = args.indexOf('--notes');
const notes = notesIdx >= 0 ? args[notesIdx + 1] || '' : '';
const version = args.find((a) => /^\d+\.\d+\.\d+([-.\w]*)?$/.test(a));

function die(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

if (!version) die('usage: npm run release 1.3.0 [--notes "What changed"] [--dry-run]');

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const run = (...a) => {
  console.log(`  git ${a.join(' ')}`);
  if (!dryRun) execFileSync('git', a, { cwd: ROOT, stdio: 'inherit' });
};

let repoRoot;
try {
  repoRoot = git('rev-parse', '--show-toplevel');
} catch (_) {
  die('This folder is not in a git repository, so there is nothing to push to.');
}

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.version === version) console.log(`  package.json is already ${version}`);

const tag = `v${version}`;
const tags = git('tag', '--list', tag);
if (tags) die(`Tag ${tag} already exists. Pick the next version number, or delete that tag first.`);

const dirty = git('status', '--porcelain');
if (dirty) {
  console.log('\n  These changes will go into the release commit:\n');
  console.log(dirty.split('\n').map((l) => `    ${l}`).join('\n'));
}

// ---- package.json ----
if (pkg.version !== version) {
  pkg.version = version;
  if (!dryRun) fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`  package.json -> ${version}`);
}

// ---- CHANGELOG ----
const changelogPath = path.join(ROOT, 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');
if (!changelog.includes(`## App ${version} `)) {
  const today = new Date().toISOString().slice(0, 10);
  const entry = `## App ${version} (${today})\n${notes ? `- ${notes}\n` : '- \n'}\n`;
  const at = changelog.indexOf('## App ');
  if (!dryRun) {
    fs.writeFileSync(changelogPath, at >= 0 ? changelog.slice(0, at) + entry + changelog.slice(at) : `${changelog}\n${entry}`);
  }
  console.log(`  CHANGELOG.md -> entry for ${version}${notes ? '' : ' (fill in what changed before pushing, or pass --notes)'}`);
}

// ---- commit, tag, push ----
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
run('add', '-A');
run('commit', '-m', `RG-Present ${version}${notes ? `\n\n${notes}` : ''}`);
run('tag', '-a', tag, '-m', `RG-Present ${version}`);
run('push', 'origin', branch);
run('push', 'origin', tag);

const remote = (() => {
  try {
    return git('remote', 'get-url', 'origin').replace(/\.git$/, '');
  } catch (_) {
    return '';
  }
})();

console.log(`\n  ${dryRun ? 'Would publish' : 'Publishing'} RG-Present ${version}.`);
if (remote) {
  console.log(`  Watch the build:  ${remote}/actions`);
  console.log(`  The release lands at: ${remote}/releases/tag/${tag}`);
}
console.log('  Church computers pick it up on their own at the next start.\n');
console.log(`  Repository root: ${repoRoot}`);
