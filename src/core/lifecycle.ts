import fs from 'node:fs/promises';
import path from 'node:path';
import { readManifest } from './manifest.js';
import { readCodexConfig, readCursorMcp } from './mcp.js';
import { componentDest } from './paths.js';
import type { ComponentType, InstallRoots, Target } from './types.js';
import { listChildDirs, listChildFiles, pathExists } from '../utils/fs.js';

export interface InstalledItem {
  type: ComponentType;
  id: string;
  name: string;
  path: string;
  mcpServers: string[];
  present: boolean;
  tracked: boolean;
}

export async function collectInstalled({ target, roots }: { target: Target; roots: InstallRoots }): Promise<InstalledItem[]> {
  const manifest = await readManifest(roots.manifest);
  const items: InstalledItem[] = [];
  const seen = new Set<string>();

  for (const entry of Object.values(manifest.components)) {
    const dest = componentDest({ target, roots, type: entry.type, name: entry.name });
    items.push({
      type: entry.type,
      id: entry.id,
      name: entry.name,
      path: dest.path,
      mcpServers: entry.mcpServers || [],
      present: await pathExists(dest.path),
      tracked: true,
    });
    seen.add(`${entry.type}:${entry.name}`);
  }

  for (const dir of await listChildDirs(roots.skills)) {
    const name = path.basename(dir);
    if (seen.has(`skill:${name}`) || seen.has(`command:${name}`)) continue;
    items.push({ type: 'skill', id: name, name, path: dir, mcpServers: [], present: true, tracked: false });
  }

  if (target === 'cursor') {
    for (const file of await listChildFiles(roots.commands, '.md')) {
      const name = path.basename(file, '.md');
      if (seen.has(`command:${name}`)) continue;
      items.push({ type: 'command', id: name, name, path: file, mcpServers: [], present: true, tracked: false });
    }
  }

  const agentExt = target === 'codex' ? '.toml' : '.md';
  for (const file of await listChildFiles(roots.agents, agentExt)) {
    const name = path.basename(file, agentExt);
    if (seen.has(`agent:${name}`)) continue;
    items.push({ type: 'agent', id: name, name, path: file, mcpServers: [], present: true, tracked: false });
  }

  const knownServers = new Set(items.flatMap((item) => item.mcpServers));
  if (await pathExists(roots.mcpFile)) {
    const text = await fs.readFile(roots.mcpFile, 'utf8');
    const servers = target === 'cursor'
      ? Object.keys(readCursorMcp(text).mcpServers || {})
      : Object.keys(readCodexConfig(text).mcp_servers || {});
    for (const name of servers) {
      if (knownServers.has(name)) continue;
      items.push({ type: 'mcp', id: name, name, path: roots.mcpFile, mcpServers: [name], present: true, tracked: false });
    }
  }

  return items.sort((a, b) => `${a.type}:${a.id}`.localeCompare(`${b.type}:${b.id}`));
}
