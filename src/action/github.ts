import fs from 'node:fs';
import os from 'node:os';

/**
 * A minimal GitHub Actions toolkit.
 *
 * `@actions/core` is a fine package, but this action bundles its entire
 * runtime into a single committed file, and the handful of things it needs -
 * read an input, write an output, emit an annotation, append to the summary -
 * are each a few lines of well-specified behaviour. Zero dependencies also
 * means nothing in the action's supply chain can change under users between
 * the tag they pinned and the run that executes it.
 */

/** Read an action input. GitHub exposes `with: fail-on` as `INPUT_FAIL-ON`. */
export function getInput(name: string): string {
  const value = process.env[`INPUT_${name.toUpperCase()}`] ?? '';
  return value.trim();
}

/** Read a boolean input, accepting the YAML spellings GitHub allows. */
export function getBooleanInput(name: string, fallback: boolean): boolean {
  const raw = getInput(name).toLowerCase();
  if (raw === '') return fallback;
  if (['true', 'yes', 'on', '1'].includes(raw)) return true;
  if (['false', 'no', 'off', '0'].includes(raw)) return false;
  throw new Error(`Input "${name}" must be true or false, got "${raw}".`);
}

/**
 * Set an action output.
 *
 * Uses the delimiter form of the `GITHUB_OUTPUT` file protocol so a value
 * containing newlines cannot break out and inject other outputs.
 */
export function setOutput(name: string, value: string): void {
  const file = process.env['GITHUB_OUTPUT'];
  const text = String(value);
  if (file === undefined || file === '') {
    process.stdout.write(`${name}=${text}${os.EOL}`);
    return;
  }
  const delimiter = `ghadelimiter_${name}_${text.length}`;
  fs.appendFileSync(file, `${name}<<${delimiter}${os.EOL}${text}${os.EOL}${delimiter}${os.EOL}`);
}

/** Append Markdown to the job summary shown on the workflow run page. */
export function appendSummary(markdown: string): void {
  const file = process.env['GITHUB_STEP_SUMMARY'];
  if (file === undefined || file === '') return;
  fs.appendFileSync(file, `${markdown}${os.EOL}`);
}

export type AnnotationLevel = 'error' | 'warning' | 'notice';

export interface Annotation {
  readonly level: AnnotationLevel;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly title?: string;
  readonly message: string;
}

/** Escape a workflow-command message body. */
function escapeData(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Escape a workflow-command property value. */
function escapeProperty(value: string): string {
  return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

/** Emit an inline annotation that appears on the pull-request diff. */
export function annotate(annotation: Annotation): void {
  const properties: string[] = [];
  if (annotation.title !== undefined) properties.push(`title=${escapeProperty(annotation.title)}`);
  if (annotation.file !== undefined) properties.push(`file=${escapeProperty(annotation.file)}`);
  if (annotation.line !== undefined) properties.push(`line=${annotation.line}`);
  if (annotation.endLine !== undefined) properties.push(`endLine=${annotation.endLine}`);
  if (annotation.column !== undefined) properties.push(`col=${annotation.column}`);
  const suffix = properties.length > 0 ? ` ${properties.join(',')}` : '';
  process.stdout.write(
    `::${annotation.level}${suffix}::${escapeData(annotation.message)}${os.EOL}`,
  );
}

/** Print a message in a collapsible group. */
export function group(title: string, body: string): void {
  process.stdout.write(`::group::${title}${os.EOL}${body}${os.EOL}::endgroup::${os.EOL}`);
}

/** Report a fatal problem in the action's own configuration or execution. */
export function fail(message: string): void {
  process.stdout.write(`::error::${escapeData(message)}${os.EOL}`);
  process.exitCode = 1;
}
