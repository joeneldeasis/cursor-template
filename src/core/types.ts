export type Target = 'cursor' | 'codex';
export type ComponentType = 'skill' | 'command' | 'agent' | 'mcp';
export type Scope = 'global' | 'project';

export interface SkillFile {
  repoPath: string;
  rel: string;
}

export interface ComponentRecord {
  type: ComponentType;
  id: string;
  name: string;
  category: string;
  repoPath?: string;
  repoDir?: string;
  primaryPath: string;
  files: SkillFile[];
}

export interface InstallRoots {
  target: Target;
  scope: Scope;
  base: string;
  skills: string;
  commands: string;
  agents: string;
  mcpFile: string;
  manifest: string;
}

export interface Dest {
  kind: 'dir' | 'file' | 'merge';
  path: string;
}

export interface ManifestEntry {
  type: ComponentType;
  id: string;
  name: string;
  mcpServers: string[];
}

export interface Manifest {
  version: 1;
  components: Record<string, ManifestEntry>;
}

export interface Catalog {
  resolve(type: ComponentType, id: string): Promise<ComponentRecord>;
  list(type?: ComponentType | null): Promise<ComponentRecord[]>;
  search(type: ComponentType, query: string): Promise<ComponentRecord[]>;
  descriptionFor(record: ComponentRecord): Promise<string>;
  readFile(repoPath: string): Promise<Buffer | null>;
}

export interface CliOptions {
  skill: string[];
  command: string[];
  agent: string[];
  mcp: string[];
  directory: string | null;
  yes: boolean;
  dryRun: boolean;
  verbose: boolean;
  debug: boolean;
  list: true | ComponentType | null;
  installed: boolean;
  doctor: boolean;
  search: { type: ComponentType; query: string } | null;
  info: { type: ComponentType; id: string } | null;
  remove: { type: ComponentType; id: string } | null;
  update: { all: true } | { type: ComponentType; id: string } | null;
}
