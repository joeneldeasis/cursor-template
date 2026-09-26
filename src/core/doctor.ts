import fs from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'smol-toml';
import { readManifest } from './manifest.js';
import { readCodexConfig, readCursorMcp } from './mcp.js';
import { componentDest } from './paths.js';
import type { InstallRoots, Target } from './types.js';
import { errorMessage } from '../utils/errors.js';
import { isWritableDir, listChildDirs, listChildFiles, pathExists } from '../utils/fs.js';

export async function doctor({ target, roots }: { target: Target; roots: InstallRoots }): Promise<{ issues: string[]; notes: string[] }> {
  const issues: string[] = [];
  const notes: string[] = [];

  for (const [label, dir] of [
    ['skills', roots.skills],
    ['commands', roots.commands],
    ['agents', roots.agents],
  ] as const) {
    if (await isWritableDir(dir)) notes.push(`writable ${label}: ${dir}`);
    else issues.push(`not writable ${label}: ${dir}`);
  }

  const manifest = await readManifest(roots.manifest);
  const skillNames = new Set<string>();
  for (const dir of await listChildDirs(roots.skills)) {
    skillNames.add(path.basename(dir));
    if (!(await pathExists(path.join(dir, 'SKILL.md')))) issues.push(`missing SKILL.md: ${dir}`);
  }

  const agentExt = target === 'codex' ? '.toml' : '.md';
  for (const file of await listChildFiles(roots.agents, agentExt)) {
    const text = await fs.readFile(file, 'utf8');
    if (!text.trim()) {
      issues.push(`empty agent file: ${file}`);
      continue;
    }
    if (target === 'codex') {
      try {
        const doc = parse(text) as Record<string, unknown>;
        for (const key of ['name', 'description', 'developer_instructions']) {
          if (!doc[key]) issues.push(`agent missing ${key}: ${file}`);
        }
      } catch (error) {
        issues.push(`agent TOML parse error: ${file}: ${errorMessage(error)}`);
      }
    }
  }

  if (await pathExists(roots.mcpFile)) {
    const text = await fs.readFile(roots.mcpFile, 'utf8');
    try {
      if (target === 'cursor') readCursorMcp(text);
      else readCodexConfig(text);
      notes.push(`mcp config ok: ${roots.mcpFile}`);
    } catch (error) {
      issues.push(`mcp parse error: ${roots.mcpFile}: ${errorMessage(error)}`);
    }
  } else {
    notes.push(`mcp config absent: ${roots.mcpFile}`);
  }

  for (const entry of Object.values(manifest.components)) {
    if (entry.type === 'skill' || (target === 'codex' && entry.type === 'command')) {
      if (!skillNames.has(entry.name)) issues.push(`missing installed ${entry.type}: ${entry.id}`);
    } else if (entry.type !== 'mcp') {
      const dest = componentDest({ target, roots, type: entry.type, name: entry.name });
      if (!(await pathExists(dest.path))) issues.push(`missing installed ${entry.type}: ${entry.id}`);
    }
  }

  return { issues, notes };
}
