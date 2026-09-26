import fs from 'node:fs/promises';
import { agentMarkdownToToml, cursorAgentMarkdown, wrapCommandAsSkill } from './adapters.js';
import { findComponent, readManifest, removeComponent, upsertComponent, writeManifest } from './manifest.js';
import {
  applyCodexMcp,
  applyCursorMcp,
  codexMcpConflicts,
  cursorMcpConflicts,
  envKeysFromServers,
  extractMcpServers,
  readCodexConfig,
  readCursorMcp,
  removeCodexServers,
  removeCursorServers,
} from './mcp.js';
import { componentDest } from './paths.js';
import { githubBlobUrl } from '../services/github.js';
import type { Catalog, ComponentRecord, ComponentType, InstallRoots, Target } from './types.js';
import { assertSafeId } from '../utils/ids.js';
import { backupOnce, confirm, isExecutableRel, pathExists, safeJoin, writeBytes } from '../utils/fs.js';

async function readTextIfExists(file: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return '';
    throw error;
  }
}

async function shouldReplace(
  dest: { kind: string; path: string },
  confirmImpl: (question: string) => Promise<boolean>,
  dryRun: boolean,
): Promise<boolean> {
  if (!(await pathExists(dest.path))) return true;
  const ok = await confirmImpl(`Overwrite ${dest.path}? (y/N) `);
  if (!ok) {
    console.log(`skipped ${dest.path}`);
    return false;
  }
  if (!dryRun && dest.kind === 'dir') await fs.rm(dest.path, { recursive: true, force: true });
  return true;
}

export async function installRecord({
  target,
  roots,
  record,
  yes = false,
  dryRun = false,
  catalog,
  confirmImpl = (question: string) => confirm(question, { yes, dryRun }),
}: {
  target: Target;
  roots: InstallRoots;
  record: ComponentRecord;
  yes?: boolean;
  dryRun?: boolean;
  catalog: Catalog;
  confirmImpl?: (question: string) => Promise<boolean>;
}): Promise<true | 'skipped' | false> {
  const dest = componentDest({ target, roots, type: record.type, name: record.name });

  if (record.type === 'skill') {
    if (!record.files.some((file) => file.rel === 'SKILL.md')) throw new Error(`SKILL.md not found in skill "${record.id}"`);
    if (!(await shouldReplace(dest, confirmImpl, dryRun))) return 'skipped';
    for (const file of record.files) {
      const buf = await catalog.readFile(file.repoPath);
      if (!buf) throw new Error(`Missing skill file ${file.repoPath}`);
      await writeBytes(safeJoin(dest.path, file.rel), buf, { executable: isExecutableRel(file.rel), dryRun });
    }
    console.log(`${dryRun ? 'would install' : 'installed'} skill ${record.id}`);
    console.log(`  ${dest.path}`);
    if (!dryRun) await remember(roots, { type: 'skill', id: record.id, name: record.name });
    return true;
  }

  if (record.type === 'command') {
    if (!record.repoPath) throw new Error(`Command "${record.id}" has no source file`);
    const buf = await catalog.readFile(record.repoPath);
    if (!buf) throw new Error(`Command "${record.id}" not found`);
    const markdown = buf.toString('utf8');
    if (!(await shouldReplace(dest, confirmImpl, dryRun))) return 'skipped';
    if (target === 'cursor') {
      await writeBytes(dest.path, markdown.endsWith('\n') ? markdown : `${markdown}\n`, { dryRun });
    } else {
      const wrapped = wrapCommandAsSkill(markdown, record.name);
      await writeBytes(safeJoin(dest.path, 'SKILL.md'), wrapped.skill, { dryRun });
      await writeBytes(safeJoin(dest.path, 'agents/openai.yaml'), wrapped.openaiYaml, { dryRun });
    }
    console.log(`${dryRun ? 'would install' : 'installed'} command ${record.id}`);
    console.log(`  ${dest.path}`);
    if (!dryRun) await remember(roots, { type: 'command', id: record.id, name: record.name });
    return true;
  }

  if (record.type === 'agent') {
    if (!record.repoPath) throw new Error(`Agent "${record.id}" has no source file`);
    const buf = await catalog.readFile(record.repoPath);
    if (!buf) throw new Error(`Agent "${record.id}" not found`);
    const markdown = buf.toString('utf8');
    if (!(await shouldReplace(dest, confirmImpl, dryRun))) return 'skipped';
    const output = target === 'cursor' ? cursorAgentMarkdown(markdown) : agentMarkdownToToml(markdown, record.name);
    await writeBytes(dest.path, output, { dryRun });
    console.log(`${dryRun ? 'would install' : 'installed'} agent ${record.id}`);
    console.log(`  ${dest.path}`);
    if (!dryRun) await remember(roots, { type: 'agent', id: record.id, name: record.name });
    return true;
  }

  if (record.type === 'mcp') {
    if (!record.repoPath) throw new Error(`MCP "${record.id}" has no source file`);
    const buf = await catalog.readFile(record.repoPath);
    if (!buf) throw new Error(`MCP "${record.id}" not found`);
    const servers = extractMcpServers(JSON.parse(buf.toString('utf8')) as unknown);
    const existing = await readTextIfExists(dest.path);
    if (!(await mergeMcp({ target, dest: dest.path, existing, servers, dryRun, confirmImpl }))) return false;
    const keys = envKeysFromServers(servers);
    console.log(`${dryRun ? 'would install' : 'installed'} mcp ${record.id}`);
    console.log(`  ${dest.path} (${Object.keys(servers).join(', ')})`);
    if (keys.length) console.log(`  env: ${keys.join(', ')}`);
    if (!dryRun) await remember(roots, { type: 'mcp', id: record.id, name: record.name, mcpServers: Object.keys(servers) });
    return true;
  }

  throw new Error(`Unknown component type "${record.type as string}"`);
}

async function mergeMcp({
  target,
  dest,
  existing,
  servers,
  dryRun,
  confirmImpl,
}: {
  target: Target;
  dest: string;
  existing: string;
  servers: Record<string, Record<string, unknown>>;
  dryRun: boolean;
  confirmImpl: (question: string) => Promise<boolean>;
}): Promise<boolean> {
  if (target === 'cursor') {
    const doc = readCursorMcp(existing);
    const conflicts = cursorMcpConflicts(doc, servers);
    const overwrite = new Set<string>();
    for (const id of conflicts) {
      if (await confirmImpl(`Overwrite MCP server "${id}" in ${dest}? (y/N) `)) overwrite.add(id);
      else console.log(`kept existing MCP server ${id}`);
    }
    if (dryRun) {
      for (const id of Object.keys(servers)) {
        if (conflicts.includes(id) && !overwrite.has(id)) continue;
        console.log(`would merge MCP server ${id} into ${dest}`);
      }
      return true;
    }
    await writeBytes(dest, applyCursorMcp(doc, servers, overwrite));
    return true;
  }

  const doc = readCodexConfig(existing);
  const conflicts = codexMcpConflicts(doc, servers);
  const overwrite = new Set<string>();
  for (const id of conflicts) {
    if (await confirmImpl(`Overwrite MCP server "${id}" in ${dest}? (y/N) `)) overwrite.add(id);
    else console.log(`kept existing MCP server ${id}`);
  }
  if (dryRun) {
    for (const id of Object.keys(servers)) {
      if (conflicts.includes(id) && !overwrite.has(id)) continue;
      console.log(`would merge MCP server ${id} into ${dest}`);
    }
    return true;
  }
  if (existing.trim()) await backupOnce(dest);
  const next = applyCodexMcp(doc, servers, overwrite);
  await writeBytes(dest, next.endsWith('\n') ? next : `${next}\n`);
  return true;
}

async function remember(roots: InstallRoots, entry: { type: ComponentType; id: string; name: string; mcpServers?: string[] }): Promise<void> {
  const manifest = await readManifest(roots.manifest);
  upsertComponent(manifest, entry);
  await writeManifest(roots.manifest, manifest);
}

export async function removeInstalled({
  target,
  roots,
  type,
  id,
  yes = false,
  dryRun = false,
  confirmImpl = (question: string) => confirm(question, { yes, dryRun }),
}: {
  target: Target;
  roots: InstallRoots;
  type: ComponentType;
  id: string;
  yes?: boolean;
  dryRun?: boolean;
  confirmImpl?: (question: string) => Promise<boolean>;
}): Promise<boolean> {
  const manifest = await readManifest(roots.manifest);
  const entry = findComponent(manifest, type, id);
  if (!entry) {
    console.log(`${type} "${id}" is not installed`);
    return false;
  }
  const dest = componentDest({ target, roots, type: entry.type, name: entry.name });
  const ok = await confirmImpl(`Remove ${entry.id} from ${dest.path}? (y/N) `);
  if (!ok && !yes && !dryRun) {
    console.log(`skipped ${entry.id}`);
    return false;
  }
  if (dryRun) {
    console.log(`would remove ${entry.type} ${entry.id}`);
    console.log(`  ${dest.path}`);
    return true;
  }
  if (entry.type === 'mcp') {
    const existing = await readTextIfExists(dest.path);
    if (existing.trim()) {
      if (target === 'cursor') await writeBytes(dest.path, removeCursorServers(readCursorMcp(existing), entry.mcpServers || []));
      else {
        const next = removeCodexServers(readCodexConfig(existing), entry.mcpServers || []);
        await writeBytes(dest.path, next.endsWith('\n') ? next : `${next}\n`);
      }
    }
  } else if (dest.kind === 'dir') await fs.rm(dest.path, { recursive: true, force: true });
  else await fs.rm(dest.path, { force: true });
  removeComponent(manifest, entry);
  await writeManifest(roots.manifest, manifest);
  console.log(`removed ${entry.type} ${entry.id}`);
  return true;
}

export function sourceLine(record: ComponentRecord): string {
  return githubBlobUrl(record.primaryPath);
}

export async function installById(options: {
  target: Target;
  roots: InstallRoots;
  type: ComponentType;
  id: string;
  yes?: boolean;
  dryRun?: boolean;
  catalog: Catalog;
}): Promise<true | 'skipped' | false> {
  assertSafeId(options.id);
  const record = await options.catalog.resolve(options.type, options.id);
  return installRecord({ ...options, record });
}
