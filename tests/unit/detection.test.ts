import { describe, expect, it } from 'vitest';
import { classifyFile } from '../../src/detection/classify.js';
import { detectFrameworks } from '../../src/detection/frameworks.js';
import { allDependencyNames, parsePackageJson } from '../../src/detection/package-json.js';

describe('classifyFile', () => {
  const cases: [string, string, string][] = [
    ['app/api/users/route.ts', '', 'next-app-route'],
    ['src/app/api/users/route.ts', '', 'next-app-route'],
    ['app/dashboard/page.tsx', '', 'next-app-page'],
    ['app/layout.tsx', '', 'next-app-special'],
    ['app/error.tsx', '', 'next-app-special'],
    ['pages/api/users.ts', '', 'next-pages-api'],
    ['pages/about.tsx', '', 'next-pages-page'],
    ['middleware.ts', '', 'next-middleware'],
    ['src/middleware.ts', '', 'next-middleware'],
    ['supabase/migrations/0001.sql', '', 'sql'],
    ['prisma/schema.prisma', '', 'prisma-schema'],
    ['tests/a.test.ts', '', 'test'],
    ['src/__tests__/a.ts', '', 'test'],
    ['.github/workflows/ci.yml', '', 'ci'],
    ['.env.production', '', 'env'],
    ['vite.config.ts', '', 'config'],
    ['package.json', '', 'config'],
    ['components/Button.tsx', '', 'react-module'],
    ['app/actions.ts', "'use server';\nexport async function a() {}", 'server-actions'],
    ['server/index.ts', "import express from 'express';", 'server-module'],
  ];

  for (const [file, content, expected] of cases) {
    it(`classifies ${file} as ${expected}`, () => {
      expect(classifyFile({ path: file, content }).role).toBe(expected);
    });
  }

  it('does not classify a file that merely mentions express as a server module', () => {
    const result = classifyFile({
      path: 'lib/hints.ts',
      content: `export const HINTS = ["from 'express'", 'require("express")'];`,
    });
    expect(result.role).not.toBe('server-module');
  });

  it('classifies a CommonJS express entry point as a server module', () => {
    const result = classifyFile({
      path: 'server.js',
      content: "const express = require('express');\nconst app = express();",
    });
    expect(result.role).toBe('server-module');
  });

  it('detects the "use client" directive past comments', () => {
    const result = classifyFile({
      path: 'components/A.tsx',
      content: '// a leading comment\n/* and a block */\n"use client";\nexport const A = 1;',
    });
    expect(result.isClientComponent).toBe(true);
    expect(result.isServer).toBe(false);
  });

  it('does not treat a mid-file string as a directive', () => {
    const result = classifyFile({
      path: 'components/A.tsx',
      content: 'export const label = "use client";',
    });
    expect(result.isClientComponent).toBe(false);
  });

  it('treats App Router pages as server unless marked client', () => {
    expect(classifyFile({ path: 'app/page.tsx', content: '' }).isServer).toBe(true);
    expect(classifyFile({ path: 'app/page.tsx', content: "'use client';" }).isServer).toBe(false);
  });

  it('treats a plain library module as server-capable', () => {
    expect(classifyFile({ path: 'lib/db.ts', content: 'export const a = 1;' }).isServer).toBe(true);
  });

  it('does not treat a component module as server-capable', () => {
    expect(classifyFile({ path: 'components/Card.tsx', content: '' }).isServer).toBe(false);
  });
});

describe('detectFrameworks', () => {
  it('prefers dependency evidence and reports high confidence', () => {
    const detected = detectFrameworks({
      pkg: { dependencies: { next: '^15.0.0', react: '^19.0.0' } },
      paths: ['app/page.tsx', 'package.json'],
    });
    const next = detected.find((f) => f.id === 'next');
    expect(next?.confidence).toBe('high');
    expect(next?.version).toBe('^15.0.0');
    expect(next?.signals).toContain('dependency:next');
  });

  it('falls back to file evidence at medium confidence', () => {
    const detected = detectFrameworks({ pkg: null, paths: ['next.config.js'] });
    expect(detected.find((f) => f.id === 'next')?.confidence).toBe('medium');
  });

  it('detects scoped dependency families', () => {
    const detected = detectFrameworks({
      pkg: { dependencies: { '@supabase/supabase-js': '^2.0.0' } },
      paths: [],
    });
    expect(detected.some((f) => f.id === 'supabase')).toBe(true);
  });

  it('distinguishes the App Router from the Pages Router', () => {
    const appRouter = detectFrameworks({
      pkg: { dependencies: { next: '^15.0.0' } },
      paths: ['app/api/x/route.ts'],
    });
    expect(appRouter.some((f) => f.id === 'next-app-router')).toBe(true);
    expect(appRouter.some((f) => f.id === 'next-pages-router')).toBe(false);

    const pagesRouter = detectFrameworks({
      pkg: { dependencies: { next: '^15.0.0' } },
      paths: ['pages/api/x.ts'],
    });
    expect(pagesRouter.some((f) => f.id === 'next-pages-router')).toBe(true);
  });

  it('detects nothing for an unrecognised project', () => {
    expect(detectFrameworks({ pkg: { dependencies: {} }, paths: ['main.c'] })).toEqual([]);
  });
});

describe('parsePackageJson', () => {
  it('parses the fields Shipcheck uses', () => {
    const result = parsePackageJson(
      '{"name":"x","scripts":{"test":"vitest"},"dependencies":{"next":"1"}}',
      'package.json',
    );
    expect(result.warning).toBeNull();
    expect(result.data?.name).toBe('x');
    expect(result.data?.scripts?.['test']).toBe('vitest');
  });

  it('degrades gracefully on malformed JSON', () => {
    const result = parsePackageJson('{ nope', 'package.json');
    expect(result.data).toBeNull();
    expect(result.warning).toContain('package.json');
  });

  it('ignores non-string dependency values', () => {
    const result = parsePackageJson('{"dependencies":{"a":1,"b":"^2"}}', 'package.json');
    expect(result.data?.dependencies).toEqual({ b: '^2' });
  });

  it('collects every dependency name', () => {
    const { data } = parsePackageJson(
      '{"dependencies":{"a":"1"},"devDependencies":{"b":"1"},"peerDependencies":{"c":"1"}}',
      'package.json',
    );
    expect([...allDependencyNames(data)].sort()).toEqual(['a', 'b', 'c']);
  });
});
