import { TYPE_ALIASES } from '../config/constants.js';
import type { ComponentType } from '../core/types.js';
import { UsageError } from './errors.js';

export function splitIds(value: string | undefined): string[] {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function baseName(id: string): string {
  const parts = String(id).split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

export function normalizeType(type: string): ComponentType {
  const key = String(type || '').trim().toLowerCase();
  const normalized = TYPE_ALIASES[key as keyof typeof TYPE_ALIASES];
  if (!normalized) {
    throw new UsageError(`Unknown component type "${type}". Use skill, command, agent, or mcp.`);
  }
  return normalized;
}

export function catalogId(category: string, name: string): string {
  return `${category}/${name}`;
}

export function assertSafeId(id: string): void {
  if (!id || id.includes('..') || id.includes('\\') || id.startsWith('/') || id.includes('\0')) {
    throw new UsageError(`Invalid component id "${id}". Use a catalog id such as creative-design/frontend-design.`);
  }
}
