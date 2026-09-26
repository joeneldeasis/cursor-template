import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const coverageDir = path.resolve('coverage');
mkdirSync(coverageDir, { recursive: true });

const [major, minor] = process.versions.node.split('.').map(Number);
const lcov = major > 20 || (major === 20 && minor >= 11);

const args = [
  '--test',
  '--experimental-test-coverage',
  '--test-reporter=spec',
  '--test-reporter-destination=stdout',
];
if (lcov) {
  args.push('--test-reporter=lcov', `--test-reporter-destination=${path.join(coverageDir, 'lcov.info')}`);
}
args.push('tests/*.test.js');

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_V8_COVERAGE: path.join(coverageDir, 'v8'),
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
