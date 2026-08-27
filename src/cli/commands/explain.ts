import { CATEGORY_LABELS } from '../../types/core.js';
import { createDefaultRegistry } from '../../rules/index.js';
import { createPalette } from '../../utils/color.js';
import { UsageError } from '../../utils/errors.js';
import { wrap } from '../../reporters/pretty.js';
import type { ParsedArgs } from '../args.js';

/** `ai-shipcheck explain <rule-id>` - the full documentation for one rule. */
export function runExplainCommand(args: ParsedArgs, color: boolean): string {
  const registry = createDefaultRegistry();
  const id = args.positionals[0];
  if (id === undefined) {
    throw new UsageError(
      'The "explain" command needs a rule id.',
      'For example: ai-shipcheck explain auth/unprotected-route-handler',
    );
  }

  const rule = registry.get(id);
  if (rule === undefined) {
    const suggestions = registry.suggest(id);
    throw new UsageError(
      `No rule with id "${id}".`,
      suggestions.length > 0
        ? `Did you mean ${suggestions.map((s) => `"${s}"`).join(' or ')}? Run "ai-shipcheck rules" for the full list.`
        : 'Run "ai-shipcheck rules" to list every rule.',
    );
  }

  const { meta } = rule;

  if (args.json) {
    return `${JSON.stringify(
      {
        id: meta.id,
        category: meta.category,
        title: meta.title,
        severity: meta.severity,
        confidence: meta.confidence,
        blocker: meta.blocker === true,
        description: meta.description,
        remediation: meta.remediation,
        references: meta.references ?? [],
        tags: meta.tags ?? [],
        requiresFrameworks: meta.requiresFrameworks ?? [],
      },
      null,
      2,
    )}\n`;
  }

  const c = createPalette(color);
  const width = Math.min(process.stdout.columns ?? 90, 96);
  const lines: string[] = [''];
  lines.push(`  ${c.bold(c.cyan(meta.id))}`);
  lines.push(`  ${c.bold(meta.title)}`);
  lines.push('');
  lines.push(
    `  ${c.dim('Category')}    ${CATEGORY_LABELS[meta.category]}\n` +
      `  ${c.dim('Severity')}    ${meta.severity}${meta.blocker === true ? c.red('  (blocker - forces NOT READY)') : ''}\n` +
      `  ${c.dim('Confidence')}  ${meta.confidence}`,
  );
  if (meta.requiresFrameworks !== undefined && meta.requiresFrameworks.length > 0) {
    lines.push(`  ${c.dim('Applies to')}  ${meta.requiresFrameworks.join(', ')}`);
  }
  if (meta.tags !== undefined && meta.tags.length > 0) {
    lines.push(`  ${c.dim('Tags')}        ${meta.tags.join(', ')}`);
  }
  lines.push('');
  lines.push(`  ${c.bold('What this means')}`);
  lines.push(`  ${wrap(meta.description, width - 4, '  ', (s) => s)}`);
  lines.push('');
  lines.push(`  ${c.bold('How to fix it')}`);
  lines.push(`  ${wrap(meta.remediation, width - 4, '  ', (s) => s)}`);
  lines.push('');
  if (meta.references !== undefined && meta.references.length > 0) {
    lines.push(`  ${c.bold('References')}`);
    for (const ref of meta.references) lines.push(`  ${c.dim('·')} ${c.cyan(ref)}`);
    lines.push('');
  }
  lines.push(
    c.dim(`  Disable with: { "rules": { "${meta.id}": "off" } } in shipcheck.config.json`),
  );
  lines.push('');
  return lines.join('\n');
}
