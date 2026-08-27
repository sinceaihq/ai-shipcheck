import { createPalette } from '../utils/color.js';
import { VERSION } from '../version.js';

/** The `--help` screen. Written to be read in one pass, top to bottom. */
export function helpText(color: boolean): string {
  const c = createPalette(color);
  return `
${c.bold('ai-shipcheck')} ${c.dim(`v${VERSION}`)}
${c.dim("Your AI says it's done. Shipcheck tells you if it's ready to ship.")}

${c.bold('USAGE')}
  ai-shipcheck [path]                 Scan a directory (defaults to the current one)
  ai-shipcheck scan [path]            The same thing, spelled out
  ai-shipcheck rules                  List every rule
  ai-shipcheck explain <rule-id>      Explain one rule in detail

${c.bold('OPTIONS')}
  -f, --format <format>    pretty | json | markdown | sarif    ${c.dim('(default: pretty)')}
  -o, --output <file>      Write the report to a file instead of stdout
      --fail-on <severity> Exit 1 if any finding is this severity or worse
                           ${c.dim('critical | high | medium | low | info | none')}
      --min-score <number> Exit 1 if the overall score is below this ${c.dim('(0-100)')}
  -c, --config <file>      Use a specific config file
      --no-color           Disable ANSI colour
  -q, --quiet              Only print findings and the verdict
  -h, --help               Show this help
  -v, --version            Print the version

${c.bold('RULES OPTIONS')}
      --category <name>    Filter "rules" output to one category
      --json               Emit "rules" or "explain" output as JSON

${c.bold('EXIT CODES')}
  0  Scan completed, thresholds met
  1  Scan completed, --fail-on or --min-score not satisfied
  2  Usage error: bad flag, missing target, invalid config
  3  Shipcheck itself failed

${c.bold('CONFIGURATION')}
  Optional. Drop a ${c.cyan('shipcheck.config.json')} in the project root:

    {
      "exclude": ["**/legacy/**"],
      "rules": { "performance/next-unoptimized-image": "off" },
      "minScore": 80,
      "failOn": "high"
    }

${c.bold('EXAMPLES')}
  ${c.dim('$')} npx ai-shipcheck .
  ${c.dim('$')} ai-shipcheck . --fail-on high
  ${c.dim('$')} ai-shipcheck . --format sarif --output shipcheck.sarif
  ${c.dim('$')} ai-shipcheck explain database/supabase-missing-rls

${c.dim('Everything runs locally. No signup, no API key, no source-code upload.')}
${c.dim('Docs: https://github.com/sinceaihq/ai-shipcheck')}
`;
}
