import { CATEGORIES } from '../types/core.js';
import type { Rule } from '../types/rule.js';

/**
 * Identity helper that validates a rule's metadata at module load.
 *
 * Every rule file calls this. Getting the contract wrong is then a startup
 * error in development and in CI rather than a subtly wrong report later.
 */
export function defineRule(rule: Rule): Rule {
  const { meta } = rule;
  const expectedPrefix = `${meta.category}/`;
  if (!meta.id.startsWith(expectedPrefix)) {
    throw new Error(
      `Rule id "${meta.id}" must start with its category prefix "${expectedPrefix}". ` +
        `Rename the rule or fix its category.`,
    );
  }
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(meta.id)) {
    throw new Error(
      `Rule id "${meta.id}" must be lowercase kebab-case in the form "category/rule-name".`,
    );
  }
  if (!(CATEGORIES as readonly string[]).includes(meta.category)) {
    throw new Error(`Rule "${meta.id}" declares unknown category "${meta.category}".`);
  }
  if (rule.checkFile === undefined && rule.checkProject === undefined) {
    throw new Error(`Rule "${meta.id}" implements neither checkFile nor checkProject.`);
  }
  for (const field of ['title', 'description', 'remediation'] as const) {
    if (meta[field].trim().length === 0) {
      throw new Error(`Rule "${meta.id}" has an empty "${field}".`);
    }
  }
  return rule;
}
