import { afterEach, describe, expect, it } from 'vitest';
import { appName, defaultPorts, env, envPort } from './index.js';

describe('config', () => {
  const keys = ['SS_TEST_ENV', 'SS_TEST_PORT'] as const;

  afterEach(() => {
    for (const k of keys) {
      delete process.env[k];
    }
  });

  it('exports app identity', () => {
    expect(appName).toBe('speedify-status');
    expect(defaultPorts.api).toBe(4090);
  });

  it('env reads and falls back', () => {
    expect(env('SS_TEST_ENV', 'fallback')).toBe('fallback');
    process.env.SS_TEST_ENV = 'set';
    expect(env('SS_TEST_ENV', 'fallback')).toBe('set');
  });

  it('env throws when missing without fallback', () => {
    expect(() => env('SS_TEST_ENV')).toThrow(/Missing required/);
  });

  it('envPort parses and validates', () => {
    expect(envPort('SS_TEST_PORT', 1234)).toBe(1234);
    process.env.SS_TEST_PORT = '8080';
    expect(envPort('SS_TEST_PORT', 1234)).toBe(8080);
    process.env.SS_TEST_PORT = 'nope';
    expect(() => envPort('SS_TEST_PORT', 1234)).toThrow(/Invalid port/);
  });
});
