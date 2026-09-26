import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'smol-toml';
import { parseCliArgs } from '../dist/cli/args.js';
import { agentMarkdownToToml, wrapCommandAsSkill } from '../dist/core/adapters.js';
import { doctor } from '../dist/core/doctor.js';
import { installRecord } from '../dist/core/install.js';
import { collectInstalled } from '../dist/core/lifecycle.js';
import {
  applyCodexMcp,
  applyCursorMcp,
  codexMcpConflicts,
  cursorMcpConflicts,
  extractMcpServers,
  readCodexConfig,
  readCursorMcp,
} from '../dist/core/mcp.js';
import { destRoots } from '../dist/core/paths.js';
import { descriptionsFromCatalog, filterRecords, indexFromTree, resolveFromIndex } from '../dist/services/github.js';
import { splitIds } from '../dist/utils/ids.js';
import { runCli } from '../dist/cli/run.js';

const tree = [
  { type: 'blob', path: 'cli-tool/components/skills/creative-design/frontend-design/SKILL.md' },
  { type: 'blob', path: 'cli-tool/components/skills/creative-design/frontend-design/scripts/run.sh' },
  { type: 'blob', path: 'cli-tool/components/skills/other/frontend-design/SKILL.md' },
  { type: 'blob', path: 'cli-tool/components/commands/testing/generate-tests.md' },
  { type: 'blob', path: 'cli-tool/components/agents/development-team/frontend-developer.md' },
  { type: 'blob', path: 'cli-tool/components/mcps/web/web-fetch.json' },
];

test('splitIds trims comma-separated values', () => {
  assert.deepEqual(splitIds(' a, b ,,c '), ['a', 'b', 'c']);
});

test('paths drop the category and follow each host', () => {
  const cursor = destRoots({ target: 'cursor', scope: 'global', home: '/home/me' });
  assert.equal(cursor.skills, path.join('/home/me', '.cursor', 'skills'));
  assert.equal(cursor.mcpFile, path.join('/home/me', '.cursor', 'mcp.json'));
  const project = destRoots({ target: 'cursor', scope: 'project', directory: '/repo', home: '/home/me' });
  assert.equal(project.agents, path.join('/repo', '.cursor', 'agents'));
  const codex = destRoots({ target: 'codex', scope: 'global', home: '/home/me' });
  assert.equal(codex.skills, path.join('/home/me', '.agents', 'skills'));
  assert.equal(codex.mcpFile, path.join('/home/me', '.codex', 'config.toml'));
});

test('catalog index resolves category ids and ambiguous names', () => {
  const index = indexFromTree(tree);
  const skill = resolveFromIndex(index, 'skill', 'creative-design/frontend-design');
  assert.equal(skill.name, 'frontend-design');
  assert.deepEqual(skill.files.map((file) => file.rel), ['SKILL.md', 'scripts/run.sh']);
  assert.throws(() => resolveFromIndex(index, 'skill', 'frontend-design'), /ambiguous/);
  assert.equal(resolveFromIndex(index, 'command', 'generate-tests').id, 'testing/generate-tests');
});

test('search matches description text', () => {
  const index = indexFromTree(tree);
  const descriptions = descriptionsFromCatalog({
    skills: [{ path: 'creative-design/frontend-design', description: 'Distinctive production interfaces' }],
  });
  const hits = filterRecords([...index.skill.values()], 'distinctive', descriptions);
  assert.deepEqual(hits.map((hit) => hit.id), ['creative-design/frontend-design']);
});

test('parseCliArgs accepts install and lifecycle flags', () => {
  const options = parseCliArgs([
    'node', 'cli',
    '--skill', 'creative-design/frontend-design,testing/foo',
    '--command', 'testing/generate-tests',
    '--project', '--yes', '--dry-run',
    '--search', 'skill', 'frontend design',
    '--update', '--all',
  ], 'cursor');
  assert.deepEqual(options.skill, ['creative-design/frontend-design', 'testing/foo']);
  assert.equal(options.directory, '.');
  assert.equal(options.search.query, 'frontend design');
  assert.deepEqual(options.update, { all: true });
});

test('invalid arguments exit 2', async () => {
  const code = await runCli('cursor', ['node', 'cursor-template', '--nope'], {
    stdout: () => {},
    stderr: () => {},
  });
  assert.equal(code, 2);
});

test('command wrapper and agent toml keep the source instructions', () => {
  const wrapped = wrapCommandAsSkill('---\ndescription: Generate tests\n---\n\nWrite tests for $ARGUMENTS\n', 'generate-tests');
  assert.match(wrapped.skill, /name: generate-tests/);
  assert.match(wrapped.openaiYaml, /allow_implicit_invocation: false/);
  const doc = parse(agentMarkdownToToml('---\nname: frontend-developer\ndescription: Builds UIs\ntools: Read\n---\n\nBe precise.\n', 'frontend-developer'));
  assert.equal(doc.name, 'frontend-developer');
  assert.match(doc.developer_instructions, /Be precise/);
});

test('cursor and codex MCP merges keep unrelated config', () => {
  const incoming = extractMcpServers({
    mcpServers: { fetch: { description: 'skip me', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] } },
  });
  const cursorDoc = readCursorMcp('{"mcpServers":{"other":{"command":"echo"}}}');
  assert.deepEqual(cursorMcpConflicts(cursorDoc, incoming), []);
  const cursorJson = JSON.parse(applyCursorMcp(cursorDoc, incoming, []));
  assert.equal(cursorJson.mcpServers.other.command, 'echo');
  assert.equal(cursorJson.mcpServers.fetch.description, undefined);
  const emptyCodex = readCodexConfig('');
  assert.deepEqual(codexMcpConflicts(emptyCodex, incoming), []);
  const codex = parse(applyCodexMcp(readCodexConfig('model = "keep-me"\n\n[mcp_servers.other]\ncommand = "echo"\n'), incoming, []));
  assert.equal(codex.model, 'keep-me');
  assert.equal(codex.mcp_servers.fetch.command, 'npx');
});

test('install writes destinations and doctor reports a broken skill', async () => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'aitmpl-'));
  const files = new Map([
    ['skill.md', '---\nname: frontend-design\ndescription: Design UIs\n---\n\nDesign it\n'],
    ['run.sh', '#!/bin/sh\necho hi\n'],
    ['command.md', '---\ndescription: Generate tests\n---\n\nWrite tests\n'],
    ['agent.md', '---\nname: frontend-developer\ndescription: Builds UIs\ntools: Read\n---\n\nBe precise.\n'],
    ['mcp.json', JSON.stringify({ mcpServers: { fetch: { description: 'x', command: 'npx', args: ['-y', 'server-fetch'] } } })],
  ]);
  const catalog = {
    async readFile(repoPath) {
      if (repoPath.endsWith('SKILL.md')) return Buffer.from(files.get('skill.md'));
      if (repoPath.endsWith('run.sh')) return Buffer.from(files.get('run.sh'));
      if (repoPath.includes('/commands/')) return Buffer.from(files.get('command.md'));
      if (repoPath.includes('/agents/')) return Buffer.from(files.get('agent.md'));
      if (repoPath.endsWith('.json')) return Buffer.from(files.get('mcp.json'));
      return null;
    },
    async resolve() { throw new Error('unused'); },
    async list() { return []; },
    async search() { return []; },
    async descriptionFor() { return ''; },
  };
  const index = indexFromTree(tree);
  const cursorRoots = destRoots({ target: 'cursor', scope: 'global', home });
  await installRecord({ target: 'cursor', roots: cursorRoots, record: resolveFromIndex(index, 'skill', 'creative-design/frontend-design'), yes: true, catalog });
  await installRecord({ target: 'cursor', roots: cursorRoots, record: resolveFromIndex(index, 'command', 'testing/generate-tests'), yes: true, catalog });
  await installRecord({ target: 'cursor', roots: cursorRoots, record: resolveFromIndex(index, 'mcp', 'web/web-fetch'), yes: true, catalog });
  const mode = await fs.stat(path.join(cursorRoots.skills, 'frontend-design', 'scripts', 'run.sh'));
  assert.equal(mode.mode & 0o111, 0o111);
  const codexRoots = destRoots({ target: 'codex', scope: 'global', home });
  await installRecord({ target: 'codex', roots: codexRoots, record: resolveFromIndex(index, 'command', 'testing/generate-tests'), yes: true, catalog });
  await installRecord({ target: 'codex', roots: codexRoots, record: resolveFromIndex(index, 'agent', 'development-team/frontend-developer'), yes: true, catalog });
  const policy = await fs.readFile(path.join(codexRoots.skills, 'generate-tests', 'agents', 'openai.yaml'), 'utf8');
  assert.match(policy, /allow_implicit_invocation: false/);
  await fs.mkdir(path.join(cursorRoots.skills, 'broken'), { recursive: true });
  const report = await doctor({ target: 'cursor', roots: cursorRoots });
  assert.ok(report.issues.some((issue) => issue.includes('missing SKILL.md')));
  const installed = await collectInstalled({ target: 'cursor', roots: cursorRoots });
  assert.ok(installed.some((item) => item.id === 'creative-design/frontend-design' && item.tracked));
});
