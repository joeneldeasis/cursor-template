import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const tarballs = readdirSync('.').filter((name) => name.endsWith('.tgz'));
if (tarballs.length !== 1) {
  console.error(`expected one .tgz in ${process.cwd()}, found ${tarballs.length}`);
  process.exit(1);
}

const tarball = path.resolve(tarballs[0]);
const work = mkdtempSync(path.join(tmpdir(), `${pkg.name}-smoke-`));
const home = path.join(work, 'home');
mkdirSync(home);
const npxCli = path.join(path.dirname(process.env.npm_execpath || ''), 'npx-cli.js');

function run(args) {
  const result = spawnSync(process.execPath, [npxCli, ...args], {
    cwd: work,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      npm_config_cache: path.join(work, 'npm-cache'),
    },
  });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  if (result.status !== 0) {
    console.error(output);
    console.error(`npx ${args.join(' ')} exited ${result.status}`);
    process.exit(result.status || 1);
  }
  return result.stdout || '';
}

try {
  if (!process.env.npm_execpath) {
    console.error('npm_execpath is missing; run this script with npm run smoke');
    process.exit(1);
  }

  const help = run(['--yes', '--package', tarball, pkg.name, '--help']);
  if (!help.includes(`Usage: ${pkg.name}`)) {
    console.error(help);
    console.error('help output did not identify the packaged command');
    process.exit(1);
  }

  const version = run(['--yes', '--package', tarball, pkg.name, '--version']).trim();
  if (version !== pkg.version) {
    console.error(`packaged version ${version} does not match package.json ${pkg.version}`);
    process.exit(1);
  }

  const installed = run(['--yes', '--package', tarball, pkg.name, '--installed']);
  if (!installed.includes('nothing installed')) {
    console.error(installed);
    console.error('expected a clean home directory to report nothing installed');
    process.exit(1);
  }

  console.log(`npx smoke ok: ${path.basename(tarball)}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
