import { defineRule } from '../../core/define-rule.js';
import { hasAuthSignal, MAX_FINDINGS_PER_RULE } from '../helpers.js';

const EXPORTED_ACTION =
  /export\s+(?:async\s+function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=\s*async)/g;

const MUTATION_EVIDENCE =
  /\.(?:insert|update|delete|upsert|create|createMany|updateMany|deleteMany|destroy|save)\s*\(|\bINSERT\s+INTO\b|\bUPDATE\s+\w|\bDELETE\s+FROM\b/i;

export default defineRule({
  meta: {
    id: 'auth/server-action-missing-auth',
    category: 'auth',
    title: 'Server action performs a write with no authorisation check',
    severity: 'high',
    confidence: 'medium',
    requiresFrameworks: ['next'],
    description:
      'Every exported function in a "use server" module becomes a callable HTTP endpoint. Next.js generates an id for it and wires it into the client bundle, so it can be invoked directly with a crafted request - it is not protected by whichever page happens to import it.',
    remediation:
      'Authenticate inside the action itself, not in the component that calls it. Start each exported action by resolving the session and returning early when there is none, then verify the caller owns the record being changed.',
    references: [
      'https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations#authentication-and-authorization',
    ],
    tags: ['authorization', 'server-actions', 'owasp-a01'],
  },

  appliesTo(index) {
    if (index.withRole('server-actions').length === 0) {
      return {
        applicable: false,
        status: 'not-applicable',
        reason: 'No "use server" modules were found in this project.',
      };
    }
    return { applicable: true };
  },

  checkFile(file, ctx) {
    if (file.role !== 'server-actions') return;
    if (hasAuthSignal(file.text)) return;

    let reported = 0;
    for (const match of file.matches(EXPORTED_ACTION)) {
      if (reported >= MAX_FINDINGS_PER_RULE) return;
      const name = match.groups[0] ?? match.groups[1] ?? 'the action';
      const body = file.functionBody(match.index);
      if (body === null) continue;
      if (!MUTATION_EVIDENCE.test(body.text)) continue;

      reported++;
      ctx.report({
        title: `Server action ${name}() writes data with no authorisation check`,
        explanation: `${file.path} exports ${name} from a "use server" module and writes data inside it, with no authentication check anywhere in the file. Next.js exposes every exported server action as a callable endpoint, so this is reachable without going through your UI.`,
        evidence: [file.evidenceAt(match.index, { note: name })],
      });
    }
  },
});
