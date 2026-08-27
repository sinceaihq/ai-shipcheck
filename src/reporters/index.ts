import { jsonReporter } from './json.js';
import { markdownReporter } from './markdown.js';
import { prettyReporter } from './pretty.js';
import { sarifReporter } from './sarif.js';
import type { Format, Reporter } from './types.js';

export * from './types.js';
export { jsonReporter, markdownReporter, prettyReporter, sarifReporter };

const REPORTERS: Readonly<Record<Format, Reporter>> = {
  pretty: prettyReporter,
  json: jsonReporter,
  markdown: markdownReporter,
  sarif: sarifReporter,
};

/** Look up a reporter by format name. */
export function getReporter(format: Format): Reporter {
  return REPORTERS[format];
}
