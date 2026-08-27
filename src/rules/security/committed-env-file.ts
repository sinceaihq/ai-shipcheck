import { defineRule } from '../../core/define-rule.js';
import { isNonProductionFile } from '../helpers.js';

/** Env files that are meant to be committed. */
const TEMPLATE_ENV = /\.env\.(?:example|sample|template|defaults?|test|ci)$/;

/** A line that assigns something other than an empty or placeholder value. */
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Z0-9_]{3,})\s*=\s*(\S.*)$/gm;

export default defineRule({
  meta: {
    id: 'security/committed-env-file',
    category: 'security',
    title: 'Environment file is not excluded from version control',
    severity: 'high',
    confidence: 'high',
    description:
      'A .env file with real-looking values is present in the working tree and is not matched by .gitignore. Environment files hold database URLs, API keys and signing secrets; once committed they are in the history of every clone and every CI checkout.',
    remediation:
      'Add .env and .env.*.local to .gitignore, remove the file from tracking with "git rm --cached .env", keep a committed .env.example containing only placeholder values, and rotate anything that was exposed.',
    references: ['https://12factor.net/config'],
    tags: ['secrets', 'configuration'],
  },

  checkProject(ctx) {
    // Test suites and playgrounds legitimately commit `.env` files as inputs
    // to the thing they are testing - env loading, for instance. Those are
    // data, not leaked configuration.
    const envFiles = ctx.index.files.filter(
      (f) => f.role === 'env' && !TEMPLATE_ENV.test(f.path) && !isNonProductionFile(f),
    );

    if (envFiles.length === 0) {
      ctx.markUnassessed('No environment files were present in the scanned tree.');
      return;
    }

    const gitignore = ctx.index.file('.gitignore');
    const ignoresEnv =
      gitignore !== undefined && /^\s*\.env(?:\*|\.\*)?\s*$/m.test(gitignore.content);

    for (const file of envFiles) {
      const assignments = [...file.content.matchAll(ASSIGNMENT)].filter(([, , value]) => {
        const v = (value ?? '').trim().replace(/^["']|["']$/g, '');
        return (
          v.length >= 8 && !v.startsWith('<') && !/^(?:your|example|placeholder|changeme)/i.test(v)
        );
      });
      if (assignments.length === 0) continue;

      ctx.report({
        title: `${file.path} contains ${assignments.length} populated variable${assignments.length === 1 ? '' : 's'} and is not gitignored`,
        confidence: ignoresEnv ? 'medium' : 'high',
        explanation: ignoresEnv
          ? `${file.path} holds ${assignments.length} populated variables. .gitignore mentions .env, but this file was still found in the working tree - confirm it is not tracked with "git ls-files ${file.path}".`
          : `${file.path} holds ${assignments.length} populated variables and no .gitignore rule excludes it. Any commit will publish these values.`,
        evidence: [file.evidenceAt(0, { note: `${assignments.length} populated variables` })],
      });
    }
  },
});
