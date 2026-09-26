import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
  const src = String(text).replace(/^\uFEFF/, '');
  if (!src.startsWith('---')) return { data: {}, body: src };
  const match = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { data: {}, body: src };
  let data: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(match[1] ?? '');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  } catch {
    data = {};
  }
  return { data, body: src.slice(match[0].length) };
}

export function stringifyFrontmatter(data: Record<string, unknown>, body: string): string {
  const yaml = stringifyYaml(data).trimEnd();
  const rest = String(body || '').replace(/^\n/, '');
  return `---\n${yaml}\n---\n\n${rest.trim()}\n`;
}

export function descriptionText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value == null) return '';
  return String(value).trim();
}
