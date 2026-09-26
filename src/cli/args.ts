import { Command } from 'commander';
import { VERSION } from '../config/constants.js';
import type { CliOptions, ComponentType, Target } from '../core/types.js';
import { UsageError } from '../utils/errors.js';
import { normalizeType, splitIds } from '../utils/ids.js';

export function commandName(target: Target): string {
  return target === 'cursor' ? 'cursor-template' : 'codex-template';
}

export function buildProgram(target: Target): Command {
  const name = commandName(target);
  const program = new Command()
    .name(name)
    .description(`Install aitmpl.com skills, commands, agents, and MCPs for ${target === 'cursor' ? 'Cursor' : 'Codex'}`)
    .version(VERSION)
    .option('--skill <ids>', 'install skills (comma-separated)')
    .option('--command <ids>', 'install commands (comma-separated)')
    .option('--agent <ids>', 'install agents (comma-separated)')
    .option('--mcp <ids>', 'install MCPs (comma-separated)')
    .option('-d, --directory <path>', 'install into a project directory instead of the user profile')
    .option('--project', 'alias for --directory .')
    .option('-y, --yes', 'overwrite without prompting')
    .option('--dry-run', 'show planned writes without changing files')
    .option('--verbose', 'log catalog requests (tokens are not printed)')
    .option('--debug', 'print stack traces for unexpected errors')
    .option('--list [type]', 'list catalog ids (skill, command, agent, mcp)')
    .option('--search <pair>', 'search the catalog: --search <type> <query>')
    .option('--info <pair>', 'show one component: --info <type> <id>')
    .option('--installed', 'list components on disk')
    .option('--remove <pair>', 'remove one component: --remove <type> <id>')
    .option('--update <pair>', 're-fetch one component: --update <type> <id>')
    .option('--update-all', 're-fetch every installed component')
    .option('--all', 'with --update, refresh everything installed')
    .option('--doctor', 'check install directories and files')
    .allowExcessArguments(false);

  program.addHelpText('after', `
Examples:
  ${name} --skill creative-design/frontend-design
  ${name} --command testing/generate-tests --project
  ${name} --search skill frontend
  ${name} --doctor

Environment:
  GITHUB_TOKEN    Optional GitHub token used when the catalog API is rate-limited
`);
  return program;
}

export function expandArgv(argv: string[]): string[] {
  const out = argv.slice(0, 2);
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i] as string;
    if (token === '--update' && args[i + 1] === '--all') {
      out.push('--update-all');
      i += 1;
      continue;
    }
    if (token === '--update' && (!args[i + 1] || args[i + 1].startsWith('-'))) {
      out.push('--update-all');
      continue;
    }
    if (token === '--search' || token === '--info' || token === '--remove' || token === '--update') {
      const left = args[i + 1];
      const right = args[i + 2];
      if (!left || left.startsWith('-') || !right || right.startsWith('-')) {
        throw new UsageError(`${token} requires <type> and a second argument.\n\nUse:\n  ${token} skill creative-design/frontend-design`);
      }
      out.push(token, `${left} ${right}`);
      i += 2;
      continue;
    }
    out.push(token);
  }
  return out;
}

function splitPair(value: string, flag: string): [string, string] {
  const index = value.indexOf(' ');
  if (index === -1) throw new UsageError(`${flag} requires <type> and a second argument`);
  return [value.slice(0, index), value.slice(index + 1)];
}

interface RawOpts {
  skill?: string;
  command?: string;
  agent?: string;
  mcp?: string;
  directory?: string;
  project?: boolean;
  yes?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
  debug?: boolean;
  list?: string | boolean;
  installed?: boolean;
  doctor?: boolean;
  search?: string;
  info?: string;
  remove?: string;
  update?: string;
  updateAll?: boolean;
  all?: boolean;
}

function listValue(value: string | boolean | undefined): ComponentType | true | null {
  if (typeof value !== 'string') return value === true ? true : null;
  return normalizeType(value);
}

export function optionsFromCommand(opts: RawOpts): CliOptions {
  const options: CliOptions = {
    skill: splitIds(opts.skill),
    command: splitIds(opts.command),
    agent: splitIds(opts.agent),
    mcp: splitIds(opts.mcp),
    directory: opts.directory || null,
    yes: Boolean(opts.yes),
    dryRun: Boolean(opts.dryRun),
    verbose: Boolean(opts.verbose),
    debug: Boolean(opts.debug),
    list: listValue(opts.list),
    installed: Boolean(opts.installed),
    doctor: Boolean(opts.doctor),
    search: null,
    info: null,
    remove: null,
    update: null,
  };
  if (opts.project && !options.directory) options.directory = '.';
  if (opts.search) {
    const [type, query] = splitPair(opts.search, '--search');
    options.search = { type: normalizeType(type), query };
  }
  if (opts.info) {
    const [type, id] = splitPair(opts.info, '--info');
    options.info = { type: normalizeType(type), id };
  }
  if (opts.remove) {
    const [type, id] = splitPair(opts.remove, '--remove');
    options.remove = { type: normalizeType(type), id };
  }
  if (opts.updateAll || opts.all) options.update = { all: true };
  else if (opts.update) {
    const [type, id] = splitPair(opts.update, '--update');
    options.update = { type: normalizeType(type), id };
  }
  if (opts.all && !opts.update && !opts.updateAll) {
    throw new UsageError('Use --update --all to refresh every installed component.');
  }
  return options;
}

export function parseCliArgs(argv: string[], target: Target): CliOptions {
  const program = buildProgram(target);
  program.exitOverride();
  program.configureOutput({ writeOut: () => {}, writeErr: () => {} });
  try {
    program.parse(expandArgv(argv));
  } catch (error) {
    if (error instanceof UsageError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new UsageError(message);
  }
  return optionsFromCommand(program.opts<RawOpts>());
}

export function hasAction(options: CliOptions): boolean {
  return Boolean(
    options.skill.length
    || options.command.length
    || options.agent.length
    || options.mcp.length
    || options.list !== null
    || options.search
    || options.info
    || options.installed
    || options.remove
    || options.update
    || options.doctor,
  );
}
