import { CATEGORIES, CATEGORY_LABELS } from '../../types/core.js';
import { createDefaultRegistry } from '../../rules/index.js';
import { createPalette, padEnd } from '../../utils/color.js';
import { UsageError } from '../../utils/errors.js';
import type { ParsedArgs } from '../args.js';

/** `ai-shipcheck rules` - list the catalogue. */
export function runRulesCommand(args: ParsedArgs, color: boolean): string {
  const registry = createDefaultRegistry();
  let rules = registry.all();

  if (args.category !== undefined) {
    if (!(CATEGORIES as readonly string[]).includes(args.category)) {
      throw new UsageError(
        `Unknown category "${args.category}".`,
        `Valid categories: ${CATEGORIES.join(', ')}.`,
      );
    }
    rules = rules.filter((r) => r.meta.category === args.category);
  }

  if (args.json) {
    return `${JSON.stringify(
      rules.map((r) => ({
        id: r.meta.id,
        category: r.meta.category,
        title: r.meta.title,
        severity: r.meta.severity,
        confidence: r.meta.confidence,
        blocker: r.meta.blocker === true,
        tags: r.meta.tags ?? [],
        requiresFrameworks: r.meta.requiresFrameworks ?? [],
      })),
      null,
      2,
    )}\n`;
  }

  const c = createPalette(color);
  const lines: string[] = [''];
  lines.push(
    `  ${c.bold(`${rules.length} rules`)}${args.category !== undefined ? c.dim(` in ${args.category}`) : ''}`,
  );
  lines.push('');

  const idWidth = Math.min(44, Math.max(...rules.map((r) => r.meta.id.length)));
  for (const category of CATEGORIES) {
    const group = rules.filter((r) => r.meta.category === category);
    if (group.length === 0) continue;
    lines.push(`  ${c.bold(CATEGORY_LABELS[category])} ${c.dim(`(${group.length})`)}`);
    for (const rule of group) {
      const severity = severityBadge(rule.meta.severity, c);
      const blocker = rule.meta.blocker === true ? c.red(' ⛔') : '   ';
      lines.push(
        `    ${c.cyan(padEnd(rule.meta.id, idWidth))} ${severity}${blocker} ${rule.meta.title}`,
      );
    }
    lines.push('');
  }
  lines.push(c.dim('  ⛔ marks a blocker: any finding forces a NOT READY verdict.'));
  lines.push(c.dim('  Run "ai-shipcheck explain <rule-id>" for the full description.'));
  lines.push('');
  return lines.join('\n');
}

function severityBadge(severity: string, c: ReturnType<typeof createPalette>): string {
  const label = padEnd(severity, 8);
  switch (severity) {
    case 'critical':
      return c.red(label);
    case 'high':
      return c.red(label);
    case 'medium':
      return c.yellow(label);
    case 'low':
      return c.blue(label);
    default:
      return c.dim(label);
  }
}
