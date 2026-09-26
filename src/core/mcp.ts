import { parse, stringify } from 'smol-toml';

const CODEX_KEYS = ['command', 'args', 'url', 'env', 'headers', 'bearer_token_env_var'] as const;

export type McpServers = Record<string, Record<string, unknown>>;

type CursorDoc = { mcpServers: McpServers; [key: string]: unknown };
type CodexDoc = { mcp_servers?: McpServers; [key: string]: unknown };

export function stable(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

export function extractMcpServers(json: unknown): McpServers {
  const record = json && typeof json === 'object' && !Array.isArray(json) ? json as Record<string, unknown> : null;
  const nested = record?.mcpServers;
  const source = nested && typeof nested === 'object' && !Array.isArray(nested) ? nested : record;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('MCP catalog file has no mcpServers object');
  }
  const servers: McpServers = {};
  for (const [id, cfg] of Object.entries(source)) {
    if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
    const next = { ...(cfg as Record<string, unknown>) };
    delete next.description;
    servers[id] = next;
  }
  if (!Object.keys(servers).length) throw new Error('MCP catalog file did not contain any servers');
  return servers;
}

export function envKeysFromServers(servers: McpServers): string[] {
  const keys: string[] = [];
  for (const cfg of Object.values(servers)) {
    const env = cfg.env;
    if (env && typeof env === 'object' && !Array.isArray(env)) keys.push(...Object.keys(env));
  }
  return [...new Set(keys)];
}

export function toCodexServer(cfg: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of CODEX_KEYS) {
    if (cfg[key] !== undefined) out[key] = cfg[key];
  }
  return out;
}

export function readCursorMcp(existingText: string): CursorDoc {
  if (!existingText || !existingText.trim()) return { mcpServers: {} };
  const doc = JSON.parse(existingText) as unknown;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('mcp.json must be a JSON object');
  const record = doc as CursorDoc;
  if (!record.mcpServers || typeof record.mcpServers !== 'object' || Array.isArray(record.mcpServers)) {
    record.mcpServers = {};
  }
  return record;
}

export function cursorMcpConflicts(doc: CursorDoc, incoming: McpServers): string[] {
  const conflicts: string[] = [];
  for (const [id, cfg] of Object.entries(incoming)) {
    const prev = doc.mcpServers[id];
    if (prev && stable(prev) !== stable(cfg)) conflicts.push(id);
  }
  return conflicts;
}

export function applyCursorMcp(doc: CursorDoc, incoming: McpServers, overwriteIds: Set<string> | string[]): string {
  const allow = overwriteIds instanceof Set ? overwriteIds : new Set(overwriteIds);
  for (const [id, cfg] of Object.entries(incoming)) {
    if (doc.mcpServers[id] && stable(doc.mcpServers[id]) !== stable(cfg) && !allow.has(id)) continue;
    doc.mcpServers[id] = cfg;
  }
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function removeCursorServers(doc: CursorDoc, ids: string[]): string {
  for (const id of ids) delete doc.mcpServers[id];
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function readCodexConfig(existingText: string): CodexDoc {
  if (!existingText || !existingText.trim()) return { mcp_servers: {} };
  const doc = parse(existingText) as CodexDoc;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {};
  if (!doc.mcp_servers || typeof doc.mcp_servers !== 'object' || Array.isArray(doc.mcp_servers)) {
    doc.mcp_servers = {};
  }
  return doc;
}

export function codexMcpConflicts(doc: CodexDoc, incoming: McpServers): string[] {
  const conflicts: string[] = [];
  const servers = doc.mcp_servers ?? {};
  for (const [id, cfg] of Object.entries(incoming)) {
    const prev = servers[id];
    if (prev && stable(prev) !== stable(toCodexServer(cfg))) conflicts.push(id);
  }
  return conflicts;
}

export function applyCodexMcp(doc: CodexDoc, incoming: McpServers, overwriteIds: Set<string> | string[]): string {
  const allow = overwriteIds instanceof Set ? overwriteIds : new Set(overwriteIds);
  if (!doc.mcp_servers) doc.mcp_servers = {};
  for (const [id, cfg] of Object.entries(incoming)) {
    const mapped = toCodexServer(cfg);
    const prev = doc.mcp_servers[id];
    if (prev && stable(prev) !== stable(mapped) && !allow.has(id)) continue;
    doc.mcp_servers[id] = mapped;
  }
  return stringify(doc);
}

export function removeCodexServers(doc: CodexDoc, ids: string[]): string {
  if (!doc.mcp_servers) doc.mcp_servers = {};
  for (const id of ids) delete doc.mcp_servers[id];
  return stringify(doc);
}
