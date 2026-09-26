import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const errors = [];

function fail(message) {
  errors.push(message);
}

function exists(relativePath) {
  try {
    readFileSync(relativePath);
    return true;
  } catch {
    return false;
  }
}

for (const field of ['name', 'version', 'description', 'license']) {
  if (!pkg[field] || typeof pkg[field] !== 'string') fail(`package.json ${field} must be a non-empty string`);
}
if (pkg.type !== 'module') fail('package.json type must be "module"');
if (pkg.license !== 'MIT') fail('package.json license must be MIT');
if (!String(pkg.engines?.node || '').includes('>=20')) fail('package.json engines.node must require Node.js 20 or newer');
if (pkg.main !== './dist/index.js') fail('package.json main must be ./dist/index.js');
if (pkg.types !== './dist/index.d.ts') fail('package.json types must be ./dist/index.d.ts');
if (pkg.exports?.['.']?.import !== './dist/index.js' || pkg.exports?.['.']?.types !== './dist/index.d.ts') {
  fail('package.json exports["."] must point at dist/index.js and dist/index.d.ts');
}
if (pkg.bin?.[pkg.name] !== './bin/cli.js') fail(`package.json bin.${pkg.name} must be ./bin/cli.js`);
for (const entry of ['dist', 'bin', 'README.md', 'LICENSE']) {
  if (!pkg.files?.includes(entry)) fail(`package.json files must include ${entry}`);
}
const repositoryUrl = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
const repository = `github.com/joeneldeasis/${pkg.name}`;
if (!String(repositoryUrl || '').includes(`${repository}.git`)) {
  fail(`package.json repository must point at ${repository}.git`);
}
if (pkg.repository && typeof pkg.repository === 'object' && 'directory' in pkg.repository) {
  fail('package.json repository must not set directory');
}
if (pkg.bugs?.url !== `https://${repository}/issues`) fail(`package.json bugs.url must be https://${repository}/issues`);
if (pkg.homepage !== `https://${repository}#readme`) fail(`package.json homepage must be https://${repository}#readme`);

const bin = exists('bin/cli.js') ? readFileSync('bin/cli.js', 'utf8') : '';
if (!bin.startsWith('#!/usr/bin/env node\n')) fail('bin/cli.js must start with a Node shebang');
for (const relativePath of ['dist/index.js', 'dist/index.d.ts', 'bin/cli.js', 'README.md', 'LICENSE']) {
  if (!exists(relativePath)) fail(`required path is missing on disk: ${relativePath}`);
}

if (!process.env.npm_execpath) fail('npm_execpath is missing; run this script with npm run package:check');

const packed = spawnSync(process.execPath, [process.env.npm_execpath, 'pack', '--dry-run', '--json'], {
  encoding: 'utf8',
});
if (packed.status !== 0) {
  fail(packed.stderr || 'npm pack --dry-run failed');
} else {
  const payload = JSON.parse(packed.stdout);
  const files = payload[0]?.files?.map((file) => file.path) ?? [];
  const required = ['package.json', 'README.md', 'LICENSE', 'bin/cli.js', 'dist/index.js', 'dist/index.d.ts'];
  for (const relativePath of required) {
    if (!files.includes(relativePath)) fail(`npm pack is missing ${relativePath}`);
  }
  const blocked = /^(src\/|tests\/|coverage\/|node_modules\/|scripts\/|\.env|tsconfig\.json|\.github\/)/;
  const sensitive = /(\.pem|\.key|id_rsa|credentials|secret|\.env)/i;
  for (const relativePath of files) {
    if (blocked.test(relativePath) || sensitive.test(relativePath)) {
      fail(`npm pack includes ${relativePath}`);
    }
  }
}

if (errors.length) {
  for (const message of errors) console.error(`package check: ${message}`);
  process.exit(1);
}

console.log(`package check ok: ${pkg.name}@${pkg.version}`);
