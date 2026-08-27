import fs from 'node:fs/promises';

/** Outcome of attempting to read a candidate file. */
export type ReadOutcome =
  | { readonly ok: true; readonly content: string }
  | {
      readonly ok: false;
      readonly reason: 'binary' | 'too-many-lines' | 'unreadable';
      readonly detail?: string;
    };

/** Bytes inspected when deciding whether a file is binary. */
const SNIFF_BYTES = 8192;

/**
 * Read a file as UTF-8 text, refusing anything that looks binary.
 *
 * Binary detection is a NUL-byte sniff over the first 8 KiB. It is cheap, has
 * no false positives on real source files, and stops the lexer from being fed
 * megabytes of image data.
 */
export async function readTextFile(absolutePath: string, maxLines: number): Promise<ReadOutcome> {
  let buffer: Buffer;
  try {
    buffer = await fs.readFile(absolutePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return { ok: false, reason: 'unreadable', detail: code ?? String(error) };
  }

  const sniffLength = Math.min(buffer.length, SNIFF_BYTES);
  for (let i = 0; i < sniffLength; i++) {
    if (buffer[i] === 0) return { ok: false, reason: 'binary' };
  }

  let content = buffer.toString('utf8');
  // Strip a UTF-8 BOM so offset 0 is the first real character.
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);

  let lines = 1;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) {
      lines++;
      if (lines > maxLines) return { ok: false, reason: 'too-many-lines' };
    }
  }

  return { ok: true, content };
}

/**
 * Detect minified or otherwise generated source that would produce useless
 * findings: very long average line length is the reliable signal.
 */
export function looksGenerated(content: string): boolean {
  if (content.length < 5000) return false;
  let newlines = 0;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) newlines++;
  }
  const averageLineLength = content.length / (newlines + 1);
  return averageLineLength > 500;
}
