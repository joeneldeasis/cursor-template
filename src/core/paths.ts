import os from 'node:os';
import path from 'node:path';
import type { ComponentType, Dest, InstallRoots, Scope, Target } from './types.js';

export function destRoots({
  target,
  scope = 'global',
  directory,
  home = os.homedir(),
}: {
  target: Target;
  scope?: Scope;
  directory?: string;
  home?: string;
}): InstallRoots {
  if (target !== 'cursor' && target !== 'codex') {
    throw new Error(`Unknown target "${target as string}"`);
  }
  const project = scope === 'project';
  if (project && !directory) {
    throw new Error('Project installs require a directory');
  }
  const projectRoot = project ? path.resolve(directory as string) : null;

  if (target === 'cursor') {
    const base = project ? path.join(projectRoot as string, '.cursor') : path.join(home, '.cursor');
    return {
      target,
      scope: project ? 'project' : 'global',
      base,
      skills: path.join(base, 'skills'),
      commands: path.join(base, 'commands'),
      agents: path.join(base, 'agents'),
      mcpFile: path.join(base, 'mcp.json'),
      manifest: path.join(base, '.aitmpl-manifest.json'),
    };
  }

  const base = project ? path.join(projectRoot as string, '.codex') : path.join(home, '.codex');
  const skills = project
    ? path.join(projectRoot as string, '.agents', 'skills')
    : path.join(home, '.agents', 'skills');
  return {
    target,
    scope: project ? 'project' : 'global',
    base,
    skills,
    commands: skills,
    agents: path.join(base, 'agents'),
    mcpFile: path.join(base, 'config.toml'),
    manifest: path.join(base, '.aitmpl-manifest.json'),
  };
}

export function componentDest({
  target,
  roots,
  type,
  name,
}: {
  target: Target;
  roots: InstallRoots;
  type: ComponentType;
  name: string;
}): Dest {
  if (type === 'skill') return { kind: 'dir', path: path.join(roots.skills, name) };
  if (type === 'command' && target === 'cursor') return { kind: 'file', path: path.join(roots.commands, `${name}.md`) };
  if (type === 'command' && target === 'codex') return { kind: 'dir', path: path.join(roots.commands, name) };
  if (type === 'agent' && target === 'cursor') return { kind: 'file', path: path.join(roots.agents, `${name}.md`) };
  if (type === 'agent' && target === 'codex') return { kind: 'file', path: path.join(roots.agents, `${name}.toml`) };
  if (type === 'mcp') return { kind: 'merge', path: roots.mcpFile };
  throw new Error(`Unknown component type "${type as string}"`);
}
