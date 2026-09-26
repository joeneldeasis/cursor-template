import fs from 'node:fs/promises';
import path from 'node:path';
import type { ComponentType, Manifest, ManifestEntry } from './types.js';
import { errorMessage } from '../utils/errors.js';

function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

export function emptyManifest(): Manifest {
  return { version: 1, components: {} };
}

export function manifestKey(type: ComponentType, id: string): string {
  return `${type}:${id}`;
}

export async function readManifest(file: string): Promise<Manifest> {
  try {
    const text = await fs.readFile(file, 'utf8');
    const data = JSON.parse(text) as Manifest;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return emptyManifest();
    if (!data.components || typeof data.components !== 'object') data.components = {};
    return data;
  } catch (error) {
    if (isEnoent(error)) return emptyManifest();
    throw new Error(`Cannot read install manifest ${file}: ${errorMessage(error)}`, { cause: error });
  }
}

export async function writeManifest(file: string, manifest: Manifest): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function upsertComponent(manifest: Manifest, entry: Omit<ManifestEntry, 'mcpServers'> & { mcpServers?: string[] }): Manifest {
  manifest.components[manifestKey(entry.type, entry.id)] = {
    type: entry.type,
    id: entry.id,
    name: entry.name,
    mcpServers: entry.mcpServers || [],
  };
  return manifest;
}

export function findComponent(manifest: Manifest, type: ComponentType, idOrName: string): ManifestEntry | null {
  const direct = manifest.components[manifestKey(type, idOrName)];
  if (direct) return direct;
  const matches = Object.values(manifest.components).filter((entry) => {
    if (entry.type !== type) return false;
    if (entry.id === idOrName || entry.name === idOrName) return true;
    return Array.isArray(entry.mcpServers) && entry.mcpServers.includes(idOrName);
  });
  if (matches.length === 1) return matches[0] ?? null;
  if (matches.length > 1) {
    throw new Error(`${type} "${idOrName}" matches multiple installs: ${matches.map((item) => item.id).join(', ')}`);
  }
  return null;
}

export function removeComponent(manifest: Manifest, entry: ManifestEntry): Manifest {
  delete manifest.components[manifestKey(entry.type, entry.id)];
  return manifest;
}
