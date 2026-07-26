import { describe, expect, it, vi } from 'vitest';
import { type ConfigLoadOptions, type ConfigSource, type ConfigValidation, loadConfig } from '../config-loader.js';

interface TestConfig {
  readonly port: number;
}

function validateConfig(candidate: unknown): ConfigValidation<TestConfig> {
  if (
    candidate !== null &&
    typeof candidate === 'object' &&
    'port' in candidate &&
    typeof candidate.port === 'number' &&
    Number.isSafeInteger(candidate.port) &&
    candidate.port > 0 &&
    candidate.port <= 65_535
  ) {
    return { valid: true, value: { port: candidate.port } };
  }
  return { valid: false, issues: ['port must be an integer from 1 through 65535'] };
}

function options(sources: readonly ConfigSource[]): ConfigLoadOptions<TestConfig> {
  return {
    precedence: 'first-listed-wins',
    sources,
    parse: (contents) => JSON.parse(contents) as unknown,
    validate: validateConfig,
  };
}

describe('loadConfig', () => {
  it('checks sources from highest to lowest precedence and stops at the first present source', async () => {
    const reads: string[] = [];
    const result = await loadConfig(
      options([
        {
          id: 'command-line',
          read: () => {
            reads.push('command-line');
            return undefined;
          },
        },
        {
          id: 'project-file',
          read: () => {
            reads.push('project-file');
            return '{"port":4100}';
          },
        },
        {
          id: 'user-file',
          read: () => {
            reads.push('user-file');
            return '{"port":4200}';
          },
        },
      ]),
    );

    expect(result).toEqual({
      ok: true,
      value: { port: 4100 },
      sourceId: 'project-file',
      checkedSources: ['command-line', 'project-file'],
      diagnostics: [],
    });
    expect(reads).toEqual(['command-line', 'project-file']);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.checkedSources)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it('passes immutable source context to parse and validate adapters', async () => {
    const parse = vi.fn((contents: string, context: { sourceId: string; precedenceIndex: number }) => {
      expect(Object.isFrozen(context)).toBe(true);
      return JSON.parse(contents) as unknown;
    });
    const validate = vi.fn(validateConfig);
    const result = await loadConfig({
      precedence: 'first-listed-wins',
      sources: [
        { id: 'missing', read: () => undefined },
        { id: 'present', read: () => '{"port":4400}' },
      ],
      parse,
      validate,
    });

    expect(result.ok).toBe(true);
    expect(parse).toHaveBeenCalledWith('{"port":4400}', { sourceId: 'present', precedenceIndex: 1 });
    expect(validate).toHaveBeenCalledWith({ port: 4400 }, { sourceId: 'present', precedenceIndex: 1 });
  });

  it('treats an empty string as present and reports its parse failure', async () => {
    const lowerRead = vi.fn(() => '{"port":4400}');
    const result = await loadConfig(
      options([
        { id: 'empty-high-priority', read: () => '' },
        { id: 'lower', read: lowerRead },
      ]),
    );

    expect(result).toMatchObject({
      ok: false,
      value: null,
      sourceId: 'empty-high-priority',
      checkedSources: ['empty-high-priority'],
      diagnostics: [{ code: 'config-parse-failed', stage: 'parse', sourceId: 'empty-high-priority' }],
    });
    expect(lowerRead).not.toHaveBeenCalled();
  });

  it('normalizes a thrown or rejected read adapter and never falls through', async () => {
    const lowerRead = vi.fn(() => '{"port":4400}');
    const result = await loadConfig(
      options([
        {
          id: 'broken-file',
          read: async () => {
            throw new Error('permission denied');
          },
        },
        { id: 'lower', read: lowerRead },
      ]),
    );

    expect(result).toMatchObject({
      ok: false,
      sourceId: 'broken-file',
      checkedSources: ['broken-file'],
      diagnostics: [
        {
          code: 'config-read-failed',
          stage: 'read',
          sourceId: 'broken-file',
          message: expect.stringContaining('permission denied'),
        },
      ],
    });
    expect(lowerRead).not.toHaveBeenCalled();
  });

  it('normalizes thrown parse and validation adapters into stage-specific diagnostics', async () => {
    const parseFailure = await loadConfig<TestConfig>({
      precedence: 'first-listed-wins',
      sources: [{ id: 'file', read: () => 'contents' }],
      parse: () => {
        throw new SyntaxError('bad format');
      },
      validate: validateConfig,
    });
    expect(parseFailure).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'config-parse-failed', stage: 'parse', message: expect.stringContaining('bad format') }],
    });

    const validationFailure = await loadConfig<TestConfig>({
      precedence: 'first-listed-wins',
      sources: [{ id: 'file', read: () => 'contents' }],
      parse: () => ({ port: 4400 }),
      validate: async () => {
        throw 'schema unavailable';
      },
    });
    expect(validationFailure).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'config-validation-failed', stage: 'validate', message: expect.stringContaining('schema unavailable') }],
    });
  });

  it('returns validation issues and does not hide them behind a lower source', async () => {
    const lowerRead = vi.fn(() => '{"port":4400}');
    const result = await loadConfig(
      options([
        { id: 'project-file', read: () => '{"port":70000}' },
        { id: 'user-file', read: lowerRead },
      ]),
    );

    expect(result).toMatchObject({
      ok: false,
      value: null,
      sourceId: 'project-file',
      checkedSources: ['project-file'],
      diagnostics: [
        {
          code: 'config-validation-failed',
          stage: 'validate',
          issues: ['port must be an integer from 1 through 65535'],
        },
      ],
    });
    expect(Object.isFrozen(result.diagnostics[0]?.issues)).toBe(true);
    expect(lowerRead).not.toHaveBeenCalled();
  });

  it('reports all missing sources explicitly instead of returning a default config', async () => {
    const result = await loadConfig(
      options([
        { id: 'project-file', read: () => undefined },
        { id: 'user-file', read: async () => undefined },
      ]),
    );

    expect(result).toEqual({
      ok: false,
      value: null,
      sourceId: null,
      checkedSources: ['project-file', 'user-file'],
      diagnostics: [
        {
          code: 'config-not-found',
          stage: 'resolve',
          sourceId: null,
          message: 'No configuration source returned content after checking 2 source(s)',
        },
      ],
    });
  });

  it('diagnoses malformed reader and validator results', async () => {
    const badRead = await loadConfig(options([{ id: 'bad-reader', read: () => null as never }]));
    expect(badRead).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'config-read-adapter-invalid', stage: 'read' }],
    });

    for (const validate of [
      () => null as never,
      () => ({ valid: false, issues: [] }) as const,
      () => ({ valid: false, issues: [''] }) as const,
      () => ({ valid: true }) as never,
    ]) {
      const badValidation = await loadConfig<TestConfig>({
        precedence: 'first-listed-wins',
        sources: [{ id: 'bad-validator', read: () => '{}' }],
        parse: (contents) => JSON.parse(contents) as unknown,
        validate,
      });
      expect(badValidation).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'config-validation-adapter-invalid', stage: 'validate' }],
      });
    }

    const throwingResult = Object.defineProperty({}, 'valid', {
      get: () => {
        throw new Error('hostile getter');
      },
    });
    const trappedValidation = await loadConfig<TestConfig>({
      precedence: 'first-listed-wins',
      sources: [{ id: 'throwing-validator-result', read: () => '{}' }],
      parse: (contents) => JSON.parse(contents) as unknown,
      validate: () => throwingResult as never,
    });
    expect(trappedValidation).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: 'config-validation-adapter-invalid',
          stage: 'validate',
          message: expect.stringContaining('hostile getter'),
        },
      ],
    });

    const revokedResult = Proxy.revocable({}, {});
    revokedResult.revoke();
    const trappedRevokedProxy = await loadConfig<TestConfig>({
      precedence: 'first-listed-wins',
      sources: [{ id: 'revoked-validator-result', read: () => '{}' }],
      parse: (contents) => JSON.parse(contents) as unknown,
      validate: () => revokedResult.proxy as never,
    });
    expect(trappedRevokedProxy).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: 'config-validation-adapter-invalid',
          stage: 'validate',
        },
      ],
    });
  });

  it('snapshots source IDs and read functions before awaiting adapters', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const source: { id: string; read: () => string | Promise<string> } = {
      id: 'stable',
      read: async () => {
        await gate;
        return '{"port":4500}';
      },
    };
    const sources = [source];
    const pending = loadConfig(options(sources));

    source.id = 'mutated';
    source.read = () => '{"port":1}';
    sources.unshift({ id: 'inserted', read: () => '{"port":2}' });
    release?.();

    expect(await pending).toMatchObject({
      ok: true,
      sourceId: 'stable',
      value: { port: 4500 },
      checkedSources: ['stable'],
    });
  });

  it('reads option and source getters exactly once while normalizing', async () => {
    const reads = {
      parse: 0,
      precedence: 0,
      read: 0,
      sources: 0,
      stageTimeoutMs: 0,
      sourceId: 0,
      validate: 0,
    };
    const source = Object.defineProperties(
      {},
      {
        id: {
          get: () => {
            reads.sourceId += 1;
            return reads.sourceId === 1 ? 'stable' : 'escape\u001b';
          },
        },
        read: {
          get: () => {
            reads.read += 1;
            return () => '{"port":4500}';
          },
        },
      },
    );
    const guardedOptions = Object.defineProperties(
      {},
      {
        parse: {
          get: () => {
            reads.parse += 1;
            return (contents: string) => JSON.parse(contents) as unknown;
          },
        },
        precedence: {
          get: () => {
            reads.precedence += 1;
            return 'first-listed-wins';
          },
        },
        sources: {
          get: () => {
            reads.sources += 1;
            return [source];
          },
        },
        stageTimeoutMs: {
          get: () => {
            reads.stageTimeoutMs += 1;
            return 1_000;
          },
        },
        validate: {
          get: () => {
            reads.validate += 1;
            return validateConfig;
          },
        },
      },
    );

    await expect(loadConfig(guardedOptions as ConfigLoadOptions<TestConfig>)).resolves.toMatchObject({
      ok: true,
      sourceId: 'stable',
      checkedSources: ['stable'],
    });
    expect(reads).toEqual({
      parse: 1,
      precedence: 1,
      read: 1,
      sources: 1,
      stageTimeoutMs: 1,
      sourceId: 1,
      validate: 1,
    });
  });

  it('rejects sparse source lists with a field-specific construction error', async () => {
    const sources = new Array<ConfigSource>(1);
    await expect(loadConfig(options(sources))).rejects.toThrow(/sources.*dense.*source 0/i);
  });

  it('sanitizes and bounds thrown adapter messages without trusting error getters', async () => {
    const result = await loadConfig(
      options([
        {
          id: 'file',
          read: () => {
            throw new Error('denied\u001b[31m');
          },
        },
      ]),
    );
    expect(result.diagnostics[0]?.message).not.toContain('\u001b');
    expect(result.diagnostics[0]?.message).toContain('denied');

    const bidiResult = await loadConfig(
      options([
        {
          id: 'bidi-error',
          read: () => {
            throw new Error('denied\u2066spoof');
          },
        },
      ]),
    );
    expect(bidiResult.diagnostics[0]?.message).not.toContain('\u2066');
    expect(bidiResult.diagnostics[0]?.message).toContain('denied\uFFFDspoof');

    const hostileError = Object.defineProperty({}, 'message', {
      get: () => {
        throw new Error('message getter escaped');
      },
    });
    const hostileResult = await loadConfig(
      options([
        {
          id: 'hostile-error',
          read: () => {
            throw hostileError;
          },
        },
      ]),
    );
    expect(hostileResult).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'config-read-failed', message: expect.stringContaining('Unknown adapter error') }],
    });

    const longResult = await loadConfig(
      options([
        {
          id: 'long-error',
          read: () => {
            throw `${'x'.repeat(1_022)}😀tail`;
          },
        },
      ]),
    );
    const longMessage = longResult.diagnostics[0]?.message ?? '';
    expect(longMessage.length).toBeLessThan(1_200);
    expect(longMessage).not.toMatch(/[\uD800-\uDFFF]/u);
    expect(longMessage).not.toContain('😀');
    expect(longMessage).toContain(`${'x'.repeat(1_022)}…`);
    expect(longMessage).toContain('…');

    const hugeDetail = `${'\u001b'.repeat(8 * 1_024 * 1_024)}tail`;
    const originalReplace = String.prototype.replace;
    const sanitizedInputLengths: number[] = [];
    let hugeMessage = '';
    String.prototype.replace = function (
      this: string,
      searchValue: unknown,
      replaceValue: unknown,
    ): string {
      if (replaceValue === '\uFFFD') sanitizedInputLengths.push(String(this).length);
      return Reflect.apply(originalReplace, this, [searchValue, replaceValue]) as string;
    };
    try {
      const hugeResult = await loadConfig(
        options([
          {
            id: 'huge-error',
            read: () => {
              throw hugeDetail;
            },
          },
        ]),
      );
      hugeMessage = hugeResult.diagnostics[0]?.message ?? '';
    } finally {
      String.prototype.replace = originalReplace;
    }

    expect(sanitizedInputLengths).toEqual([1_024]);
    expect(hugeMessage).toContain(`${'\uFFFD'.repeat(1_023)}…`);
    expect(hugeMessage).not.toContain('\u001b');
  });

  it('bounds every adapter stage when stageTimeoutMs is provided', async () => {
    const never = new Promise<never>(() => undefined);

    for (const stage of ['read', 'parse', 'validate'] as const) {
      const lowerRead = vi.fn(() => '{"port":4600}');
      const result = await loadConfig<TestConfig>({
        precedence: 'first-listed-wins',
        sources: [
          {
            id: 'blocked',
            read: () => (stage === 'read' ? never : '{"port":4500}'),
          },
          { id: 'lower', read: lowerRead },
        ],
        parse: (contents) => (stage === 'parse' ? never : (JSON.parse(contents) as unknown)),
        validate: (candidate) => (stage === 'validate' ? never : validateConfig(candidate)),
        stageTimeoutMs: 10,
      });

      expect(result).toMatchObject({
        ok: false,
        sourceId: 'blocked',
        checkedSources: ['blocked'],
        diagnostics: [{ code: 'config-adapter-timeout', stage, sourceId: 'blocked' }],
      });
      expect(lowerRead).not.toHaveBeenCalled();
    }
  });

  it('never assimilates hostile structural thenables returned by adapters', async () => {
    for (const stage of ['read', 'parse', 'validate'] as const) {
      let thenCalls = 0;
      const selfThenable = Object.defineProperty({}, 'then', {
        value: (resolve: (value: unknown) => void) => {
          thenCalls += 1;
          resolve(selfThenable);
        },
      });

      const result = await loadConfig<TestConfig>({
        precedence: 'first-listed-wins',
        sources: [
          {
            id: 'hostile-thenable',
            read: () => (stage === 'read' ? (selfThenable as never) : '{}'),
          },
        ],
        parse: () => (stage === 'parse' ? selfThenable : { port: 4100 }),
        validate: () =>
          stage === 'validate'
            ? (selfThenable as never)
            : stage === 'parse'
              ? { valid: false, issues: ['not a parsed config'] }
              : { valid: true, value: { port: 4100 } },
        stageTimeoutMs: 10,
      });

      expect(result.ok).toBe(false);
      expect(result.diagnostics[0]?.code).toBe(
        stage === 'read'
          ? 'config-read-adapter-invalid'
          : stage === 'validate'
            ? 'config-validation-adapter-invalid'
            : 'config-validation-failed',
      );
      expect(thenCalls).toBe(0);
    }
  });

  it('takes one exact validator-result snapshot and deeply detaches successful plain data', async () => {
    const original = {
      nested: {
        ports: [4100, 4200],
      },
    };
    let validReads = 0;
    let valueReads = 0;
    const validationResult = Object.defineProperties(
      {},
      {
        valid: {
          get: () => {
            validReads += 1;
            return true;
          },
        },
        value: {
          get: () => {
            valueReads += 1;
            return original;
          },
        },
      },
    );
    const result = await loadConfig<typeof original>({
      precedence: 'first-listed-wins',
      sources: [{ id: 'file', read: () => '{}' }],
      parse: (contents) => JSON.parse(contents) as unknown,
      validate: () => validationResult as ConfigValidation<typeof original>,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected successful config');
    original.nested.ports[0] = -1;
    original.nested.ports.push(4300);

    expect(result.value).toEqual({ nested: { ports: [4100, 4200] } });
    expect(result.value).not.toBe(original);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.nested)).toBe(true);
    expect(Object.isFrozen(result.value.nested.ports)).toBe(true);
    expect(validReads).toBe(1);
    expect(valueReads).toBe(1);
  });

  it('rejects validator values that cannot satisfy the immutable plain-data contract', async () => {
    class StatefulConfig {
      readonly port = 4100;
    }

    const accessorValue = Object.defineProperty({}, 'port', {
      enumerable: true,
      get: () => 4100,
    });
    const invalidValues: readonly unknown[] = [
      new StatefulConfig(),
      new Map([['port', 4100]]),
      accessorValue,
      { port: 4100, callback: () => undefined },
      { port: '\uD800' },
    ];

    for (const value of invalidValues) {
      const result = await loadConfig<TestConfig>({
        precedence: 'first-listed-wins',
        sources: [{ id: 'file', read: () => '{}' }],
        parse: (contents) => JSON.parse(contents) as unknown,
        validate: () => ({ valid: true, value }) as ConfigValidation<TestConfig>,
      });
      expect(result).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'config-validation-adapter-invalid', stage: 'validate' }],
      });
    }
  });

  it('reads validation issues once and rejects sparse, unsafe, or unbounded diagnostics', async () => {
    let issuesReads = 0;
    const issues = ['invalid port'];
    const validationResult = Object.defineProperties(
      {},
      {
        issues: {
          get: () => {
            issuesReads += 1;
            return issues;
          },
        },
        valid: { value: false },
      },
    );
    const validFailure = await loadConfig<TestConfig>({
      precedence: 'first-listed-wins',
      sources: [{ id: 'file', read: () => '{}' }],
      parse: (contents) => JSON.parse(contents) as unknown,
      validate: () => validationResult as ConfigValidation<TestConfig>,
    });
    issues[0] = 'mutated';

    expect(validFailure).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'config-validation-failed', issues: ['invalid port'] }],
    });
    expect(issuesReads).toBe(1);

    const sparseIssues = new Array<string>(1);
    for (const invalidIssues of [
      sparseIssues,
      ['\uD800'],
      ['bad\u202Etxt'],
      [' '],
      ['x'.repeat(2_049)],
      Array.from({ length: 101 }, () => 'issue'),
    ]) {
      const invalidFailure = await loadConfig<TestConfig>({
        precedence: 'first-listed-wins',
        sources: [{ id: 'file', read: () => '{}' }],
        parse: (contents) => JSON.parse(contents) as unknown,
        validate: () => ({ valid: false, issues: invalidIssues }),
      });
      expect(invalidFailure).toMatchObject({
        ok: false,
        diagnostics: [{ code: 'config-validation-adapter-invalid', stage: 'validate' }],
      });
    }
  });

  it('rejects empty or duplicate source IDs and malformed loader options', async () => {
    await expect(loadConfig(null as never)).rejects.toThrow(/options.*object/i);
    await expect(loadConfig({ precedence: 'last-listed-wins' } as never)).rejects.toThrow(/precedence/i);
    await expect(loadConfig({ precedence: 'first-listed-wins', sources: [] } as never)).rejects.toThrow(/at least one/i);
    await expect(
      loadConfig({
        ...options([
          { id: 'same', read: () => undefined },
          { id: 'same', read: () => undefined },
        ]),
      }),
    ).rejects.toThrow(/unique/i);

    for (const id of ['', ' padded ', 'escape\u001b', 'safe\u202Etxt', '\uD800', 'x'.repeat(257)]) {
      await expect(loadConfig(options([{ id, read: () => undefined }]))).rejects.toThrow(/source.*id/i);
    }
    await expect(loadConfig({ ...options([{ id: 'source', read: () => undefined }]), parse: null as never })).rejects.toThrow(/parse adapter/i);
    await expect(loadConfig({ ...options([{ id: 'source', read: () => undefined }]), validate: null as never })).rejects.toThrow(/validate adapter/i);
    await expect(loadConfig(options([{ id: 'source', read: null as never }]))).rejects.toThrow(/read adapter/i);
    const oversizedSources = new Proxy([] as ConfigSource[], {
      get(target, property, receiver) {
        return property === 'length' ? 1_001 : Reflect.get(target, property, receiver);
      },
    });
    await expect(loadConfig(options(oversizedSources))).rejects.toThrow(
      /no greater than 1000/i,
    );
    for (const stageTimeoutMs of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648]) {
      await expect(
        loadConfig({
          ...options([{ id: 'source', read: () => undefined }]),
          stageTimeoutMs,
        }),
      ).rejects.toThrow(/stage timeout/i);
    }
  });

  it('is reachable from the public package barrel', async () => {
    const barrel: Record<string, unknown> = await import('../index.js');
    expect(barrel['loadConfig']).toBe(loadConfig);
  });
});
