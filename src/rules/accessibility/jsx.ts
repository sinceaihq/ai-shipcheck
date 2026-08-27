/**
 * Minimal JSX element scanning for the accessibility rules.
 *
 * Attribute values routinely contain `>` inside expression containers
 * (`onClick={() => close()}`), so a naive `<div[^>]*>` regex misreads them.
 * This walks the opening tag tracking brace depth instead.
 */
import type { SourceFile } from '../../analysis/source-file.js';

export interface JsxElement {
  readonly tag: string;
  /** Offset of the `<`. */
  readonly start: number;
  /** Offset one past the `>` that closes the opening tag. */
  readonly end: number;
  /** Original source text of the whole opening tag. */
  readonly text: string;
  /** Original source text of the attribute region only. */
  readonly attributes: string;
  /** True for `<tag ... />`. */
  readonly selfClosing: boolean;
}

/** Match the start of an opening tag; component names may be capitalised. */
function tagPattern(tags: readonly string[]): RegExp {
  return new RegExp(`<(${tags.join('|')})(?=[\\s/>])`, 'g');
}

/**
 * Find every opening tag for the given element names.
 *
 * @param file - File to scan. Only JSX-capable files should be passed.
 * @param tags - Element names, e.g. `['img']` or `['div', 'span']`.
 */
export function findElements(file: SourceFile, tags: readonly string[]): JsxElement[] {
  const out: JsxElement[] = [];
  const code = file.code;

  for (const match of file.matches(tagPattern(tags))) {
    const end = findTagEnd(code, match.index);
    if (end === -1) continue;
    const text = file.content.slice(match.index, end);
    const tagName = match.groups[0] ?? tags[0]!;
    const attrStart = match.index + 1 + tagName.length;
    const selfClosing = code.slice(Math.max(attrStart, end - 2), end).includes('/');
    out.push({
      tag: tagName,
      start: match.index,
      end,
      text,
      attributes: file.content.slice(attrStart, selfClosing ? end - 2 : end - 1),
      selfClosing,
    });
  }
  return out;
}

/** Offset just past the `>` closing the opening tag beginning at `start`. */
function findTagEnd(code: string, start: number): number {
  let depth = 0;
  for (let i = start + 1; i < code.length && i < start + 4000; i++) {
    const ch = code[i];
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth <= 0) return i + 1;
    else if (ch === '<' && depth <= 0 && i > start + 1) return -1; // malformed
  }
  return -1;
}

/**
 * Read a JSX attribute's value.
 *
 * @returns `null` when absent, `''` for a bare attribute, the literal text for
 *   `attr="value"`, or the expression source for `attr={expr}`.
 */
export function attributeValue(attributes: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${name}(?=[\\s=/>]|$)`, 'i');
  const m = re.exec(attributes);
  if (m === null) return null;
  let i = m.index + m[0].length;
  while (i < attributes.length && /\s/.test(attributes[i]!)) i++;
  if (attributes[i] !== '=') return '';
  i++;
  while (i < attributes.length && /\s/.test(attributes[i]!)) i++;
  const opener = attributes[i];
  if (opener === '"' || opener === "'") {
    const close = attributes.indexOf(opener, i + 1);
    return close === -1 ? attributes.slice(i + 1) : attributes.slice(i + 1, close);
  }
  if (opener === '{') {
    let depth = 0;
    for (let k = i; k < attributes.length; k++) {
      if (attributes[k] === '{') depth++;
      else if (attributes[k] === '}') {
        depth--;
        if (depth === 0) return attributes.slice(i + 1, k);
      }
    }
    return attributes.slice(i + 1);
  }
  return '';
}

/** True when the attribute is present at all, in any form. */
export function hasAttribute(attributes: string, name: string): boolean {
  return attributeValue(attributes, name) !== null;
}

/** True when the tag spreads props, which may supply the missing attribute. */
export function hasSpread(attributes: string): boolean {
  return /\{\s*\.\.\./.test(attributes);
}

/**
 * Offset just past the closing tag that matches an element opened at
 * `openingTagEnd`, or the end of the file when it cannot be found.
 *
 * Used to decide whether one element is nested inside another - for instance
 * whether a form control sits inside a `<label>`, which associates the two
 * without needing `htmlFor`.
 */
export function closingTagEnd(content: string, openingTagEnd: number, tag: string): number {
  const open = new RegExp(`<${tag}(?=[\\s/>])`, 'g');
  const close = new RegExp(`</${tag}\\s*>`, 'g');
  let depth = 1;
  let cursor = openingTagEnd;
  for (let guard = 0; guard < 500; guard++) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(content);
    const nextClose = close.exec(content);
    if (nextClose === null) return content.length;
    if (nextOpen !== null && nextOpen.index < nextClose.index) {
      depth++;
      cursor = nextOpen.index + nextOpen[0].length;
      continue;
    }
    depth--;
    cursor = nextClose.index + nextClose[0].length;
    if (depth === 0) return cursor;
  }
  return content.length;
}
