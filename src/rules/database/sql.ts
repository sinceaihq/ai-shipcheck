/**
 * Lightweight SQL helpers for migration analysis.
 *
 * These are not a SQL parser. They recognise the handful of statements that
 * matter for production readiness - table creation, row-level security and
 * policy definitions - with comments stripped so a commented-out `ENABLE ROW
 * LEVEL SECURITY` cannot be mistaken for the real thing.
 */

/** Remove `--` and block comments from SQL, preserving offsets. */
export function stripSqlComments(sql: string): string {
  const out: string[] = new Array<string>(sql.length);
  for (let i = 0; i < sql.length; i++) out[i] = sql[i]!;
  let i = 0;
  let inString = false;
  let quote = '';
  while (i < sql.length) {
    const ch = sql[i]!;
    if (inString) {
      if (ch === quote) inString = false;
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = true;
      quote = ch;
      i++;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
      continue;
    }
    if (ch === '/' && sql[i + 1] === '*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      for (let k = i; k < stop; k++) {
        if (sql[k] !== '\n') out[k] = ' ';
      }
      i = stop;
      continue;
    }
    i++;
  }
  return out.join('');
}

export interface SqlTable {
  /** Bare table name, without schema qualification or quoting. */
  readonly name: string;
  /** Schema-qualified name as written. */
  readonly qualified: string;
  /** Offset of the CREATE TABLE statement. */
  readonly offset: number;
}

const CREATE_TABLE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?((?:"[^"\n]{1,64}"|[a-z_][\w$]*)(?:\s*\.\s*(?:"[^"\n]{1,64}"|[a-z_][\w$]*))?)/gi;

/** Every table created in a SQL document. */
export function findCreatedTables(sql: string): SqlTable[] {
  const tables: SqlTable[] = [];
  const re = new RegExp(CREATE_TABLE.source, CREATE_TABLE.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const qualified = m[1];
    if (qualified === undefined) continue;
    const bare = qualified.split('.').pop() ?? qualified;
    tables.push({
      name: bare.replace(/"/g, '').trim().toLowerCase(),
      qualified: qualified.trim(),
      offset: m.index,
    });
  }
  return tables;
}

const ENABLE_RLS =
  /alter\s+table\s+(?:if\s+exists\s+)?((?:"[^"\n]{1,64}"|[a-z_][\w$]*)(?:\s*\.\s*(?:"[^"\n]{1,64}"|[a-z_][\w$]*))?)\s+enable\s+row\s+level\s+security/gi;

/** Table names (bare, lowercased) that have RLS explicitly enabled. */
export function findRlsEnabledTables(sql: string): Set<string> {
  const names = new Set<string>();
  const re = new RegExp(ENABLE_RLS.source, ENABLE_RLS.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const qualified = m[1];
    if (qualified === undefined) continue;
    const bare = qualified.split('.').pop() ?? qualified;
    names.add(bare.replace(/"/g, '').trim().toLowerCase());
  }
  return names;
}

export interface SqlPolicy {
  readonly name: string;
  readonly table: string;
  readonly offset: number;
  /** Full statement text, comments removed. */
  readonly statement: string;
}

const CREATE_POLICY =
  /create\s+policy\s+("[^"\n]{1,120}"|'[^'\n]{1,120}'|[a-z_][\w$]*)\s+on\s+((?:"[^"\n]{1,64}"|[a-z_][\w$]*)(?:\s*\.\s*(?:"[^"\n]{1,64}"|[a-z_][\w$]*))?)/gi;

/** Every `CREATE POLICY` statement, with its text up to the terminating `;`. */
export function findPolicies(sql: string): SqlPolicy[] {
  const policies: SqlPolicy[] = [];
  const re = new RegExp(CREATE_POLICY.source, CREATE_POLICY.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1];
    const table = m[2];
    if (name === undefined || table === undefined) continue;
    const end = sql.indexOf(';', m.index);
    policies.push({
      name: name.replace(/["']/g, ''),
      table: (table.split('.').pop() ?? table).replace(/"/g, '').trim().toLowerCase(),
      offset: m.index,
      statement: sql.slice(m.index, end === -1 ? sql.length : end),
    });
  }
  return policies;
}
