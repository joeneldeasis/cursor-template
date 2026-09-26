import { stringify } from 'smol-toml';
import { descriptionText, parseFrontmatter, stringifyFrontmatter } from '../utils/frontmatter.js';

export function cursorAgentMarkdown(markdown: string): string {
  const { data, body } = parseFrontmatter(markdown);
  if (!Object.keys(data).length) return markdown.endsWith('\n') ? markdown : `${markdown}\n`;
  delete data.tools;
  return stringifyFrontmatter(data, body);
}

export function agentMarkdownToToml(markdown: string, fallbackName: string): string {
  const { data, body } = parseFrontmatter(markdown);
  const name = descriptionText(data.name) || fallbackName;
  const description = descriptionText(data.description) || `Use the ${name} agent.`;
  return stringify({
    name,
    description,
    developer_instructions: `${body.trim()}\n`,
  });
}

export function wrapCommandAsSkill(markdown: string, name: string): { skill: string; openaiYaml: string; description: string } {
  const { data, body } = parseFrontmatter(markdown);
  const description = descriptionText(data.description) || `Run the ${name} workflow from aitmpl.`;
  return {
    skill: stringifyFrontmatter({ name, description }, body),
    openaiYaml: 'policy:\n  allow_implicit_invocation: false\n',
    description,
  };
}
