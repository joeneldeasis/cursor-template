import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

export async function pathExists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export function safeJoin(root: string, rel: string): string {
  if (!rel || rel.split('/').includes('..')) {
    throw new Error(`Refusing unsafe relative path "${rel}".`);
  }
  const dest = path.resolve(root, rel);
  const base = path.resolve(root);
  if (dest !== base && !dest.startsWith(base + path.sep)) {
    throw new Error(`Refusing to write outside ${base}: ${rel}`);
  }
  return dest;
}

export async function writeBytes(
  file: string,
  data: string | Buffer,
  { executable = false, dryRun = false }: { executable?: boolean; dryRun?: boolean } = {},
): Promise<void> {
  if (dryRun) {
    console.log(`would write ${file}`);
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
  if (executable) await fs.chmod(file, 0o755);
}

export function isExecutableRel(rel: string): boolean {
  return rel.endsWith('.py') || rel.endsWith('.sh');
}

export async function confirm(
  question: string,
  {
    yes = false,
    dryRun = false,
    input = process.stdin,
    output = process.stdout,
  }: { yes?: boolean; dryRun?: boolean; input?: Readable; output?: Writable } = {},
): Promise<boolean> {
  if (yes || dryRun) return true;
  if (!('isTTY' in input) || !input.isTTY) {
    console.log('skipped (not a TTY; pass --yes to overwrite)');
    return false;
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

export async function nearestExistingParent(file: string): Promise<string> {
  let current = file;
  for (;;) {
    if (await pathExists(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

export async function isWritableDir(dir: string): Promise<boolean> {
  const existing = await nearestExistingParent(dir);
  try {
    await fs.access(existing, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function listChildDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => path.join(dir, entry.name));
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }
}

export async function listChildFiles(dir: string, extension?: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && (!extension || entry.name.endsWith(extension)))
      .map((entry) => path.join(dir, entry.name));
  } catch (error) {
    if (isEnoent(error)) return [];
    throw error;
  }
}

export async function backupOnce(file: string): Promise<void> {
  const backup = `${file}.bak`;
  if (!(await pathExists(file)) || (await pathExists(backup))) return;
  await fs.copyFile(file, backup);
}
