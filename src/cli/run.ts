import os from 'node:os';
import path from 'node:path';
import chalk from 'chalk';
import { BROWSE } from '../config/constants.js';
import { doctor } from '../core/doctor.js';
import { installById, removeInstalled, sourceLine } from '../core/install.js';
import { collectInstalled } from '../core/lifecycle.js';
import { readManifest } from '../core/manifest.js';
import { componentDest, destRoots } from '../core/paths.js';
import type { Catalog, CliOptions, ComponentType, Target } from '../core/types.js';
import { createCatalog } from '../services/github.js';
import { UsageError, formatError } from '../utils/errors.js';
import { assertSafeId, normalizeType } from '../utils/ids.js';
import { buildProgram, hasAction, parseCliArgs } from './args.js';

export interface CliIo {
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  home?: string;
  catalog?: Catalog;
  fetchImpl?: typeof fetch;
  argv?: string[];
}

function browseLines(): string {
  return [
    `  skills    ${BROWSE.skills}`,
    `  commands  ${BROWSE.commands}`,
    `  agents    ${BROWSE.agents}`,
    `  mcps      ${BROWSE.mcps}`,
  ].join('\n');
}

export function printHelp(target: Target): void {
  buildProgram(target).outputHelp();
  console.log(`\nBrowse:\n${browseLines()}`);
}

function rootsFor(target: Target, options: CliOptions, home: string) {
  return destRoots({
    target,
    scope: options.directory ? 'project' : 'global',
    directory: options.directory ? path.resolve(options.directory) : undefined,
    home,
  });
}

export async function runCli(target: Target, argv: string[] = process.argv, io: CliIo = {}): Promise<number> {
  const log = io.stdout || console.log;
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    printHelp(target);
    return 0;
  }
  if (args.includes('-V') || args.includes('--version')) {
    buildProgram(target).parse(argv);
    return 0;
  }

  let options: CliOptions;
  try {
    options = parseCliArgs(argv, target);
  } catch (error) {
    const stderr = io.stderr || ((message: string) => console.error(chalk.red(message)));
    stderr(formatError(error, false));
    return error instanceof UsageError ? error.exitCode : 2;
  }

  const stderr = io.stderr || ((message: string) => console.error(chalk.red(message)));
  if (!hasAction(options)) {
    printHelp(target);
    return 0;
  }

  const roots = rootsFor(target, options, io.home || os.homedir());
  const catalog = io.catalog || createCatalog({ verbose: options.verbose || options.debug, fetchImpl: io.fetchImpl });
  let code = 0;
  const fail = (error: unknown): void => {
    stderr(formatError(error, options.debug));
    code = error instanceof UsageError ? error.exitCode : 1;
  };

  if (options.list !== null) {
    try {
      const records = await catalog.list(options.list === true ? null : options.list);
      const groups = new Map<string, string[]>();
      for (const record of records) {
        const list = groups.get(record.type) || [];
        list.push(record.id);
        groups.set(record.type, list);
      }
      for (const [group, ids] of groups) {
        log(chalk.cyan(`${group} (${ids.length})`));
        for (const id of ids) log(`  ${id}`);
      }
    } catch (error) {
      fail(error);
    }
  }

  if (options.search) {
    try {
      const records = await catalog.search(options.search.type, options.search.query);
      if (!records.length) log(`no ${options.search.type} matches for "${options.search.query}"`);
      for (const record of records) {
        const description = await catalog.descriptionFor(record);
        log(`${record.id}${description ? `\n  ${description}` : ''}`);
      }
    } catch (error) {
      fail(error);
    }
  }

  if (options.info) {
    try {
      assertSafeId(options.info.id);
      const record = await catalog.resolve(options.info.type, options.info.id);
      const dest = componentDest({ target, roots, type: record.type, name: record.name });
      const description = await catalog.descriptionFor(record);
      log(`${record.type} ${record.id}`);
      log(`name: ${record.name}`);
      log(`source: ${sourceLine(record)}`);
      log(`install: ${dest.path}`);
      if (description) log(`description: ${description}`);
    } catch (error) {
      fail(error);
    }
  }

  if (options.installed) {
    try {
      const items = await collectInstalled({ target, roots });
      if (!items.length) log('nothing installed');
      for (const item of items) {
        const state = item.present ? '' : chalk.yellow(' missing');
        log(`${item.type.padEnd(8)} ${item.tracked ? item.id : `${item.id} (untracked)`}${state}`);
        log(`  ${item.path}`);
      }
    } catch (error) {
      fail(error);
    }
  }

  if (options.remove) {
    try {
      assertSafeId(options.remove.id);
      const removed = await removeInstalled({
        target,
        roots,
        type: options.remove.type,
        id: options.remove.id,
        yes: options.yes,
        dryRun: options.dryRun,
      });
      if (!removed) code = 1;
    } catch (error) {
      fail(error);
    }
  }

  if (options.update) {
    try {
      const jobs: { type: ComponentType; id: string }[] = [];
      if ('all' in options.update) {
        const manifest = await readManifest(roots.manifest);
        jobs.push(...Object.values(manifest.components));
        if (!jobs.length) log('nothing installed to update');
      } else {
        assertSafeId(options.update.id);
        jobs.push({ type: options.update.type, id: options.update.id });
      }
      for (const job of jobs) {
        const ok = await installById({
          target,
          roots,
          type: normalizeType(job.type),
          id: job.id,
          yes: true,
          dryRun: options.dryRun,
          catalog,
        });
        if (ok === false) code = 1;
      }
    } catch (error) {
      fail(error);
    }
  }

  for (const type of ['skill', 'command', 'agent', 'mcp'] as const) {
    for (const id of options[type]) {
      try {
        assertSafeId(id);
        const ok = await installById({ target, roots, type, id, yes: options.yes, dryRun: options.dryRun, catalog });
        if (ok === false) code = 1;
      } catch (error) {
        fail(error);
      }
    }
  }

  if (options.doctor) {
    try {
      const report = await doctor({ target, roots });
      for (const note of report.notes) log(chalk.green(note));
      for (const issue of report.issues) log(chalk.yellow(issue));
      if (report.issues.length) code = 1;
      else if (!report.notes.length) log('doctor: ok');
    } catch (error) {
      fail(error);
    }
  }

  return code;
}
