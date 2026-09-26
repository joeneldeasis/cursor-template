import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'cli.js');

function run(args) {
  return spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8' });
}

test('packaged bin prints help and version', () => {
  const help = run(['--help']);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: cursor-template/);
  assert.match(help.stdout, /--skill/);
  assert.match(help.stdout, /GITHUB_TOKEN/);
  const version = run(['--version']);
  assert.equal(version.status, 0);
  assert.match(version.stdout, /0\.1\.0/);
});

test('unknown flag exits 2', () => {
  const result = run(['--nope']);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /unknown option/i);
});
