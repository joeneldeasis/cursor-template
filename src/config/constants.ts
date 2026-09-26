export const REPO = 'davila7/claude-code-templates';
export const BRANCH = 'main';
export const COMPONENTS_PREFIX = 'cli-tool/components/';
export const VERSION = '0.1.0';
export const USER_AGENT = `cursor-codex-templates/${VERSION}`;

export const BROWSE = {
  skills: 'https://aitmpl.com/skills/',
  commands: 'https://aitmpl.com/commands/',
  agents: 'https://aitmpl.com/agents/',
  mcps: 'https://aitmpl.com/mcps/',
} as const;

export const TYPE_ALIASES = {
  skill: 'skill',
  skills: 'skill',
  command: 'command',
  commands: 'command',
  agent: 'agent',
  agents: 'agent',
  mcp: 'mcp',
  mcps: 'mcp',
} as const;

export const CATALOG_GROUPS = {
  skills: 'skill',
  commands: 'command',
  agents: 'agent',
  mcps: 'mcp',
} as const;
