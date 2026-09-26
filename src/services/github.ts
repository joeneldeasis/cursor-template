import { BRANCH, CATALOG_GROUPS, COMPONENTS_PREFIX, REPO, USER_AGENT } from '../config/constants.js';
import type { Catalog, ComponentRecord, ComponentType } from '../core/types.js';
import { catalogId } from '../utils/ids.js';

interface TreeEntry {
  type?: string;
  path?: string;
}

interface CatalogIndex {
  skill: Map<string, ComponentRecord>;
  command: Map<string, ComponentRecord>;
  agent: Map<string, ComponentRecord>;
  mcp: Map<string, ComponentRecord>;
  skillByName: Map<string, ComponentRecord[]>;
  commandByName: Map<string, ComponentRecord[]>;
  agentByName: Map<string, ComponentRecord[]>;
  mcpByName: Map<string, ComponentRecord[]>;
}

export function rawUrl(repoPath: string): string {
  return `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${repoPath}`;
}

export function githubBlobUrl(repoPath: string): string {
  return `https://github.com/${REPO}/blob/${BRANCH}/${repoPath}`;
}

export function indexFromTree(tree: TreeEntry[]): CatalogIndex {
  const index: CatalogIndex = {
    skill: new Map(),
    command: new Map(),
    agent: new Map(),
    mcp: new Map(),
    skillByName: new Map(),
    commandByName: new Map(),
    agentByName: new Map(),
    mcpByName: new Map(),
  };
  const skillFiles = new Map<string, ComponentRecord>();

  for (const entry of tree) {
    if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') continue;
    if (!entry.path.startsWith(COMPONENTS_PREFIX)) continue;
    const rest = entry.path.slice(COMPONENTS_PREFIX.length);
    const parts = rest.split('/');
    const kind = parts[0];

    if (kind === 'skills' && parts.length >= 3) {
      const category = parts[1] as string;
      const name = parts[2] as string;
      const rel = parts.slice(3).join('/');
      if (!rel || rel.split('/').includes('..')) continue;
      const id = catalogId(category, name);
      if (!skillFiles.has(id)) {
        skillFiles.set(id, {
          type: 'skill',
          id,
          name,
          category,
          repoDir: `${COMPONENTS_PREFIX}skills/${category}/${name}`,
          primaryPath: `${COMPONENTS_PREFIX}skills/${category}/${name}/SKILL.md`,
          files: [],
        });
      }
      skillFiles.get(id)?.files.push({ repoPath: entry.path, rel });
      continue;
    }

    if (parts.length !== 3) continue;
    const category = parts[1] as string;
    const file = parts[2] as string;
    if (kind === 'commands' && file.endsWith('.md')) addFlat(index, 'command', category, file.replace(/\.md$/, ''), entry.path);
    else if (kind === 'agents' && file.endsWith('.md')) addFlat(index, 'agent', category, file.replace(/\.md$/, ''), entry.path);
    else if (kind === 'mcps' && file.endsWith('.json')) addFlat(index, 'mcp', category, file.replace(/\.json$/, ''), entry.path);
  }

  for (const record of skillFiles.values()) {
    record.files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
    index.skill.set(record.id, record);
    pushName(index.skillByName, record);
  }
  return index;
}

function addFlat(index: CatalogIndex, type: 'command' | 'agent' | 'mcp', category: string, name: string, repoPath: string): void {
  const record: ComponentRecord = {
    type,
    id: catalogId(category, name),
    name,
    category,
    repoPath,
    primaryPath: repoPath,
    files: [{ repoPath, rel: repoPath.split('/').pop() || name }],
  };
  index[type].set(record.id, record);
  pushName(index[`${type}ByName`], record);
}

function pushName(map: Map<string, ComponentRecord[]>, record: ComponentRecord): void {
  const list = map.get(record.name) || [];
  list.push(record);
  map.set(record.name, list);
}

function label(type: ComponentType): string {
  if (type === 'mcp') return 'MCP';
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export function resolveFromIndex(index: CatalogIndex, type: ComponentType, id: string): ComponentRecord {
  const map = index[type];
  if (String(id).includes('/')) {
    const hit = map.get(id);
    if (!hit) {
      const error = new Error(`${label(type)} "${id}" not found`);
      throw error;
    }
    return hit;
  }
  const matches = index[`${type}ByName`].get(id) || [];
  if (matches.length === 1) return matches[0] as ComponentRecord;
  if (matches.length === 0) throw new Error(`${label(type)} "${id}" not found`);
  throw new Error(`${label(type)} "${id}" is ambiguous: ${matches.map((item) => item.id).sort().join(', ')}`);
}

export function listFromIndex(index: CatalogIndex, type?: ComponentType | null): ComponentRecord[] {
  if (type) return [...index[type].values()].sort((a, b) => a.id.localeCompare(b.id));
  return (['skill', 'command', 'agent', 'mcp'] as const).flatMap((key) => listFromIndex(index, key));
}

export function filterRecords(records: ComponentRecord[], query: string, descriptions: Map<string, string> = new Map()): ComponentRecord[] {
  const needle = String(query || '').trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => {
    const description = descriptions.get(`${record.type}:${record.id}`) || '';
    return [record.id, record.name, record.category, description].join('\n').toLowerCase().includes(needle);
  });
}

export function descriptionsFromCatalog(json: unknown): Map<string, string> {
  const map = new Map<string, string>();
  if (!json || typeof json !== 'object') return map;
  const record = json as Record<string, unknown>;
  for (const [group, type] of Object.entries(CATALOG_GROUPS)) {
    const items = record[group];
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as { path?: string; description?: string };
      const id = String(entry.path || '').replace(/\\/g, '/').replace(/\.(md|json)$/i, '');
      if (!id) continue;
      map.set(`${type}:${id}`, typeof entry.description === 'string' ? entry.description.trim() : '');
    }
  }
  return map;
}

export function createCatalog({
  fetchImpl = globalThis.fetch,
  token = process.env.GITHUB_TOKEN,
  verbose = false,
}: {
  fetchImpl?: typeof fetch;
  token?: string;
  verbose?: boolean;
} = {}): Catalog {
  let treePromise: Promise<CatalogIndex> | undefined;
  let descriptionPromise: Promise<Map<string, string>> | undefined;

  function log(message: string): void {
    if (verbose) console.error(message);
  }

  async function github(url: string, accept: string): Promise<Response> {
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT, Accept: accept };
    if (token) headers.Authorization = `Bearer ${token}`;
    log(`GET ${url}`);
    const response = await fetchImpl(url, { headers });
    if (response.status === 403 || response.status === 429) {
      throw new Error(`GitHub rate limit (${response.status}). Set GITHUB_TOKEN and retry.`);
    }
    return response;
  }

  async function getTree(): Promise<CatalogIndex> {
    if (!treePromise) {
      treePromise = (async () => {
        const response = await github(`https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`, 'application/vnd.github+json');
        if (!response.ok) throw new Error(`GitHub tree fetch failed: HTTP ${response.status}`);
        const data = await response.json() as { truncated?: boolean; tree?: TreeEntry[] };
        if (data.truncated) throw new Error('GitHub tree response was truncated. Set GITHUB_TOKEN and retry.');
        return indexFromTree(data.tree || []);
      })();
    }
    return treePromise;
  }

  async function descriptions(): Promise<Map<string, string>> {
    if (!descriptionPromise) {
      descriptionPromise = (async () => {
        const response = await github(rawUrl('docs/components.json'), 'application/octet-stream');
        if (!response.ok) return new Map<string, string>();
        return descriptionsFromCatalog(await response.json());
      })().catch((error: unknown) => {
        log(`description index unavailable: ${error instanceof Error ? error.message : error}`);
        return new Map<string, string>();
      });
    }
    return descriptionPromise;
  }

  return {
    async resolve(type, id) {
      return resolveFromIndex(await getTree(), type, id);
    },
    async list(type) {
      return listFromIndex(await getTree(), type);
    },
    async search(type, query) {
      return filterRecords(listFromIndex(await getTree(), type), query, await descriptions());
    },
    async descriptionFor(record) {
      return (await descriptions()).get(`${record.type}:${record.id}`) || '';
    },
    async readFile(repoPath) {
      const response = await github(rawUrl(repoPath), 'application/octet-stream');
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Download failed for ${repoPath}: HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
