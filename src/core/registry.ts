import type { Category } from '../types/core.js';
import type { Rule } from '../types/rule.js';

/**
 * The in-memory rule catalogue.
 *
 * Rules are registered once at startup from `src/rules/index.ts`. The registry
 * enforces global id uniqueness, which is what lets rule ids be a stable
 * public contract in SARIF output and `shipcheck.config.json`.
 */
export class RuleRegistry {
  readonly #rules = new Map<string, Rule>();

  static from(rules: readonly Rule[]): RuleRegistry {
    const registry = new RuleRegistry();
    for (const rule of rules) registry.add(rule);
    return registry;
  }

  add(rule: Rule): void {
    if (this.#rules.has(rule.meta.id)) {
      throw new Error(`Duplicate rule id "${rule.meta.id}". Rule ids must be globally unique.`);
    }
    this.#rules.set(rule.meta.id, rule);
  }

  get(id: string): Rule | undefined {
    return this.#rules.get(id);
  }

  get size(): number {
    return this.#rules.size;
  }

  /** All rules, sorted by id for deterministic execution order. */
  all(): readonly Rule[] {
    return [...this.#rules.values()].sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  }

  byCategory(category: Category): readonly Rule[] {
    return this.all().filter((r) => r.meta.category === category);
  }

  /** Rule ids closest to `id`, for "did you mean" hints. */
  suggest(id: string, limit = 3): readonly string[] {
    const scored = this.all()
      .map((r) => ({
        id: r.meta.id,
        distance: editDistance(id.toLowerCase(), r.meta.id.toLowerCase()),
      }))
      .sort((a, b) => a.distance - b.distance);
    return scored
      .filter((s) => s.distance <= Math.max(4, id.length / 2))
      .slice(0, limit)
      .map((s) => s.id);
  }
}

function editDistance(a: string, b: string): number {
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]!;
  }
  return prev[b.length]!;
}
