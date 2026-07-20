/**
 * Smart fence renderer tests (B9)
 */

import { describe, expect, it } from 'vitest';
import { chartFenceRenderer } from '../fence-renderers/chart.js';
import { csvFenceRenderer } from '../fence-renderers/csv.js';
import { httpFenceRenderer } from '../fence-renderers/http.js';
import { jsonFenceRenderer } from '../fence-renderers/json.js';
import { sqlFenceRenderer } from '../fence-renderers/sql.js';
import { defaultTheme } from '../theme.js';

function ctx(overrides?: Partial<Parameters<typeof jsonFenceRenderer>[1]>) {
  return {
    theme: defaultTheme(),
    options: {},
    width: 80,
    indent: 0,
    ...overrides,
  };
}

describe('jsonFenceRenderer', () => {
  it('pretty-prints valid JSON', () => {
    const out = jsonFenceRenderer({ type: 'code-block', language: 'json', content: '{"a":1,"b":[2,3]}' }, ctx());
    expect(out).not.toBeNull();
    expect(out).toContain('"a"');
    expect(out).toContain('"b"');
  });

  it('returns null for invalid JSON (falls through)', () => {
    const out = jsonFenceRenderer({ type: 'code-block', language: 'json', content: '{not json' }, ctx());
    expect(out).toBeNull();
  });
});

describe('csvFenceRenderer', () => {
  it('renders CSV as an aligned table', () => {
    const out = csvFenceRenderer({ type: 'code-block', language: 'csv', content: 'a,b,c\n1,2,3\n4,5,6' }, ctx());
    expect(out).not.toBeNull();
    expect(out).toContain('a');
    expect(out).toContain('1');
    expect(out).toContain('│');
  });

  it('returns null for empty CSV', () => {
    const out = csvFenceRenderer({ type: 'code-block', language: 'csv', content: '' }, ctx());
    expect(out).toBeNull();
  });
});

describe('sqlFenceRenderer', () => {
  it('formats and highlights SQL', () => {
    const out = sqlFenceRenderer({ type: 'code-block', language: 'sql', content: 'SELECT * FROM users WHERE id = 1' }, ctx());
    expect(out).not.toBeNull();
    expect(out).toContain('SELECT');
  });
});

describe('httpFenceRenderer', () => {
  it('renders HTTP request with headers and body', () => {
    const out = httpFenceRenderer(
      {
        type: 'code-block',
        language: 'http',
        content: 'GET /api/users HTTP/1.1\nHost: example.com\nContent-Type: application/json\n\n{"foo":"bar"}',
      },
      ctx(),
    );
    expect(out).not.toBeNull();
    expect(out).toContain('GET');
    expect(out).toContain('Host:');
  });

  it('returns null for non-HTTP content', () => {
    const out = httpFenceRenderer({ type: 'code-block', language: 'http', content: 'just some text' }, ctx());
    expect(out).toBeNull();
  });
});

describe('chartFenceRenderer', () => {
  it('renders valid chart JSON through Stellar', () => {
    const out = chartFenceRenderer(
      { type: 'code-block', language: 'chart', content: '{"type":"bar","data":[1,3,2],"width":20,"height":4}' },
      ctx({ width: 20 }),
    );
    expect(out).toMatch(/[\u2800-\u28ff]/u);
  });

  it('reports invalid chart specifications without dropping the source fallback', () => {
    const out = chartFenceRenderer({ type: 'code-block', language: 'chart', content: '{"type":"pie","data":[1,2]}' }, ctx());
    expect(out).toContain('Unsupported or invalid chart spec');
    expect(out).toContain('falling back to source');
  });

  it('never exceeds the available render width', () => {
    const out = chartFenceRenderer(
      { type: 'code-block', language: 'chart', content: '{"type":"line","data":[1,2,3],"width":200,"height":2}' },
      ctx({ width: 8 }),
    );
    expect(out?.split('\n').every((line) => line.length <= 8)).toBe(true);
  });
});
