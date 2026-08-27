import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyOverrides, loadConfig } from '../../src/config/load.js';
import { DEFAULT_CONFIG, validateConfig } from '../../src/config/schema.js';
import { ConfigError } from '../../src/utils/errors.js';
import { makeProject, removeProject } from '../helpers/project.js';

describe('validateConfig', () => {
  it('accepts an empty object', () => {
    const config = validateConfig({}, 'shipcheck.config.json');
    expect(config.exclude).toEqual([]);
    expect(config.minScore).toBeNull();
  });

  it('reads every supported option', () => {
    const config = validateConfig(
      {
        exclude: ['legacy/**'],
        rules: {
          'security/eval-usage': 'off',
          'auth/unprotected-route-handler': { severity: 'critical' },
        },
        disabledCategories: ['accessibility'],
        minScore: 80,
        failOn: 'high',
        respectGitignore: false,
        limits: { maxFiles: 100 },
      },
      'shipcheck.config.json',
    );
    expect(config.exclude).toEqual(['legacy/**']);
    expect(config.rules['security/eval-usage']).toBe('off');
    expect(config.rules['auth/unprotected-route-handler']).toEqual({ severity: 'critical' });
    expect(config.disabledCategories).toEqual(['accessibility']);
    expect(config.minScore).toBe(80);
    expect(config.failOn).toBe('high');
    expect(config.respectGitignore).toBe(false);
    expect(config.limits.maxFiles).toBe(100);
  });

  it('rejects an unknown option and suggests the closest match', () => {
    expect(() => validateConfig({ excludes: [] }, 'c.json')).toThrow(ConfigError);
    try {
      validateConfig({ excludes: [] }, 'c.json');
    } catch (error) {
      expect((error as ConfigError).hint).toContain('exclude');
    }
  });

  it('rejects a non-object configuration', () => {
    expect(() => validateConfig([], 'c.json')).toThrow(/expected a JSON object/);
  });

  it('rejects an invalid severity override', () => {
    expect(() =>
      validateConfig({ rules: { 'security/eval-usage': { severity: 'catastrophic' } } }, 'c.json'),
    ).toThrow(/expected one of/);
  });

  it('rejects an unknown rule option', () => {
    expect(() =>
      validateConfig({ rules: { 'security/eval-usage': { level: 'error' } } }, 'c.json'),
    ).toThrow(/Unknown option "level"/);
  });

  it('rejects an out-of-range minScore', () => {
    expect(() => validateConfig({ minScore: 140 }, 'c.json')).toThrow(/between 0 and 100/);
  });

  it('rejects an unknown category', () => {
    expect(() => validateConfig({ disabledCategories: ['vibes'] }, 'c.json')).toThrow(
      /Unknown category/,
    );
  });

  it('rejects an unknown limit', () => {
    expect(() => validateConfig({ limits: { maxWidgets: 4 } }, 'c.json')).toThrow(/Unknown limit/);
  });

  it('rejects a non-integer limit', () => {
    expect(() => validateConfig({ limits: { maxFiles: -1 } }, 'c.json')).toThrow(
      /positive integer/,
    );
  });

  it('names the file in every error', () => {
    expect(() => validateConfig({ minScore: 'high' }, 'my-config.json')).toThrow(/my-config\.json/);
  });
});

describe('loadConfig', () => {
  it('returns defaults when no configuration exists', async () => {
    const dir = await makeProject({ 'package.json': '{"name":"x"}' });
    try {
      expect(await loadConfig({ root: dir })).toEqual(DEFAULT_CONFIG);
    } finally {
      await removeProject(dir);
    }
  });

  it('reads shipcheck.config.json from the scan root', async () => {
    const dir = await makeProject({
      'shipcheck.config.json': '{ "minScore": 70 }',
      'package.json': '{}',
    });
    try {
      const config = await loadConfig({ root: dir });
      expect(config.minScore).toBe(70);
      expect(config.sourcePath).toBe(path.join(dir, 'shipcheck.config.json'));
    } finally {
      await removeProject(dir);
    }
  });

  it('accepts comments and trailing commas', async () => {
    const dir = await makeProject({
      'shipcheck.config.json': '{\n  // threshold\n  "minScore": 70,\n}',
    });
    try {
      expect((await loadConfig({ root: dir })).minScore).toBe(70);
    } finally {
      await removeProject(dir);
    }
  });

  it('reads a "shipcheck" key from package.json', async () => {
    const dir = await makeProject({
      'package.json': '{"name":"x","shipcheck":{"failOn":"critical"}}',
    });
    try {
      expect((await loadConfig({ root: dir })).failOn).toBe('critical');
    } finally {
      await removeProject(dir);
    }
  });

  it('errors when an explicit --config file is missing', async () => {
    const dir = await makeProject({ 'package.json': '{}' });
    try {
      await expect(
        loadConfig({ root: dir, explicitPath: path.join(dir, 'nope.json') }),
      ).rejects.toThrow(/Configuration file not found/);
    } finally {
      await removeProject(dir);
    }
  });

  it('reports malformed JSON readably', async () => {
    const dir = await makeProject({ 'shipcheck.config.json': '{ "minScore": }' });
    try {
      await expect(loadConfig({ root: dir })).rejects.toThrow(/Could not parse/);
    } finally {
      await removeProject(dir);
    }
  });
});

describe('applyOverrides', () => {
  it('lets CLI flags win over the file', () => {
    const merged = applyOverrides(
      { ...DEFAULT_CONFIG, minScore: 50, failOn: 'low' },
      {
        minScore: 90,
        failOn: 'critical',
      },
    );
    expect(merged.minScore).toBe(90);
    expect(merged.failOn).toBe('critical');
  });

  it('keeps file values when no flag was passed', () => {
    const merged = applyOverrides({ ...DEFAULT_CONFIG, minScore: 50 }, {});
    expect(merged.minScore).toBe(50);
  });

  it('appends CLI excludes to file excludes', () => {
    const merged = applyOverrides({ ...DEFAULT_CONFIG, exclude: ['a/**'] }, { exclude: ['b/**'] });
    expect(merged.exclude).toEqual(['a/**', 'b/**']);
  });
});
