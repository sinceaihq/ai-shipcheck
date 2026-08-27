import { describe, expect, it } from 'vitest';
import { maskSecret, maskValue } from '../../src/utils/mask.js';

/**
 * Masking is a hard guarantee, not a nicety: a scanner that prints the secret
 * it found has made the problem worse. Every reporter path runs through here.
 */
describe('maskValue', () => {
  it('keeps a short prefix and the length', () => {
    expect(maskValue('sk-ant-abcdefghijklmnop')).toBe('sk-a…[masked:23]');
  });

  it('reveals nothing at all for short values', () => {
    expect(maskValue('short')).toBe('…[masked:5]');
  });

  it('handles the empty string', () => {
    expect(maskValue('')).toBe('');
  });
});

describe('maskSecret', () => {
  const cases: [string, string][] = [
    ['const k = "sk-ant-SHIPCHECKFIXTUREKEY000000000000"', 'SHIPCHECKFIXTUREKEY000000000000'],
    ['ghp_SHIPCHECKFIXTUREKEY0000000000000000', 'ghp_SHIPCHECKFIXTUREKEY0000000000000000'],
    ['AKIASHIPCHECKFIXT000', 'AKIASHIPCHECKFIXT000'],
    ['whsec_SHIPCHECKFIXTURE00000', 'whsec_SHIPCHECKFIXTURE00000'],
  ];

  for (const [input, secret] of cases) {
    it(`redacts ${secret.slice(0, 10)}…`, () => {
      const masked = maskSecret(input);
      expect(masked).not.toContain(secret);
      expect(masked).toContain('masked');
    });
  }

  it('redacts the password in a connection string but keeps the host', () => {
    const masked = maskSecret('postgresql://app:Hx9Kd2NbTgH5sYcJf8Ae@db.example.com:5432/app');
    expect(masked).not.toContain('Hx9Kd2NbTgH5sYcJf8Ae');
    expect(masked).toContain('db.example.com');
  });

  it('redacts assignment-shaped secrets', () => {
    const masked = maskSecret('const API_KEY = "Qm4pLv9WxKd2NbTgH5sYcJf8AeUiO3Rz";');
    expect(masked).not.toContain('Qm4pLv9WxKd2NbTgH5sYcJf8AeUiO3Rz');
  });

  it('redacts JWTs', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27u';
    expect(maskSecret(jwt)).not.toContain(jwt);
  });

  it('leaves ordinary text untouched', () => {
    const text = 'return Response.json({ status: "ok" });';
    expect(maskSecret(text)).toBe(text);
  });

  it('redacts unquoted environment assignments', () => {
    const masked = maskSecret('SESSION_SECRET=Qm4pLv9WxKd2NbTgH5sYcJf8AeUiO3Rz');
    expect(masked).not.toContain('Qm4pLv9WxKd2NbTgH5sYcJf8AeUiO3Rz');
    expect(masked).toContain('SESSION_SECRET=');
  });

  it('leaves environment references readable', () => {
    const text = 'API_KEY=process.env.UPSTREAM_KEY';
    expect(maskSecret(text)).toBe(text);
  });

  it('is stable on empty input', () => {
    expect(maskSecret('')).toBe('');
  });
});
