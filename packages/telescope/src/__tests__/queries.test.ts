import {
  animated,
  type AppConfig,
  Cmd,
  column,
  component,
  lazy,
  localState,
  memo,
  portal,
  row,
  Sub,
  suspense,
  tabGroup,
  text,
  type VNode,
  withClass,
  withMetadata,
} from '@celestial/core/nebula';
import { afterEach, describe, expect, it } from 'vitest';
import { a11y, createQueryEngine, testId } from '../queries.js';
import { createScreen } from '../screen.js';
import { createTestApp, type TestAppHandle } from '../test-app.js';

// ── Test app fixtures ──────────────────────────────────────────────────

type Msg = { type: 'noop' };

function simpleApp(view: (m: null) => VNode): AppConfig<null, Msg> {
  return {
    init: () => [null, Cmd.none()],
    update: (_msg, model) => [model, Cmd.none()],
    view: () => view(null),
    subscriptions: () => Sub.none(),
  };
}

describe('queries', () => {
  let handle: TestAppHandle<null, Msg> | null = null;

  afterEach(() => {
    if (handle) {
      handle.stop();
      handle = null;
    }
  });

  // ── getByText ──────────────────────────────────────────────────────

  describe('getByText', () => {
    it('finds element by exact text', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello World')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByText('Hello World');
      expect(result.text).toBe('Hello World');
    });

    it('finds element by regex', () => {
      handle = createTestApp(
        simpleApp(() => text('Count: 42')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByText(/Count: \d+/);
      expect(result.text).toContain('Count:');
    });

    it('finds element with case-insensitive regex', () => {
      handle = createTestApp(
        simpleApp(() => text('HELLO WORLD')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByText(/hello world/i);
      expect(result.text).toBe('HELLO WORLD');
    });

    it('throws when text not found', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.getByText('Goodbye')).toThrow(/Unable to find/);
    });

    it('error message shows what was found', () => {
      handle = createTestApp(
        simpleApp(() => column(text('Alpha'), text('Beta'), text('Gamma'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.getByText('Delta')).toThrow(/Alpha.*Beta.*Gamma/s);
    });

    it('has position information', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByText('Hello');
      expect(result.row).toBe(0);
      expect(result.col).toBe(0);
    });
  });

  // ── getAllByText ────────────────────────────────────────────────────

  describe('getAllByText', () => {
    it('returns all matching elements', () => {
      handle = createTestApp(
        simpleApp(() => column(text('Item A'), text('Item B'), text('Item C'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.getAllByText(/Item/);
      expect(results).toHaveLength(3);
    });

    it('throws when no elements found', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.getAllByText('Missing')).toThrow(/Unable to find/);
    });
  });

  // ── queryByText ────────────────────────────────────────────────────

  describe('queryByText', () => {
    it('returns result when found', () => {
      handle = createTestApp(
        simpleApp(() => text('Present')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.queryByText('Present');
      expect(result).not.toBeNull();
      expect(result!.text).toBe('Present');
    });

    it('returns null when not found', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.queryByText('Missing');
      expect(result).toBeNull();
    });

    it('does not hide view or layout failures as a missing result', () => {
      let broken = false;
      handle = createTestApp(
        simpleApp(() => {
          if (broken) throw new Error('view failed');
          return text('Present');
        }),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      broken = true;

      expect(() => screen.queryByText('Present')).toThrow('view failed');
    });
  });

  // ── getByTestId ────────────────────────────────────────────────────

  describe('getByTestId', () => {
    it('finds element by test ID', () => {
      handle = createTestApp(
        simpleApp(() => testId('sidebar', text('Sidebar Content'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByTestId('sidebar');
      expect(result.testId).toBe('sidebar');
    });

    it('throws when test ID not found', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.getByTestId('missing')).toThrow(/Unable to find.*test ID/);
    });
  });

  describe('getBySelector', () => {
    it('finds elements by metadata id', () => {
      handle = createTestApp(
        simpleApp(() => withMetadata({ id: 'sidebar' }, text('Sidebar Content'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getBySelector('#sidebar');
      expect(result.id).toBe('sidebar');
      expect(result.text).toBe('Sidebar Content');
    });

    it('finds elements by metadata class', () => {
      handle = createTestApp(
        simpleApp(() => column(withClass('primary', text('Save')), withClass('secondary', text('Cancel')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getBySelector('.primary');
      expect(result.classes).toContain('primary');
      expect(result.text).toBe('Save');
    });

    it('supports descendant selector matching across metadata and role', () => {
      handle = createTestApp(
        simpleApp(() =>
          withMetadata(
            { id: 'dialog-root' },
            column(a11y({ role: 'dialog', label: 'Delete dialog' }, text('Delete dialog')), withClass('primary', text('Delete'))),
          ),
        ),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getBySelector('#dialog-root .primary');
      expect(result.text).toBe('Delete');
    });

    it('supports attribute selector matching for roles and test ids', () => {
      handle = createTestApp(
        simpleApp(() => column(a11y({ role: 'dialog', label: 'Modal' }, testId('modal', text('Modal Content'))), text('Other'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(screen.getBySelector('[test-id="modal"]').testId).toBe('modal');
      expect(screen.getBySelector('[role="dialog"]').role).toBe('dialog');
    });

    it('surfaces invalid selector syntax from query variants', () => {
      handle = createTestApp(simpleApp(() => text('Content')), { cols: 40, rows: 10 });
      const screen = createScreen(handle);

      expect(() => screen.queryBySelector('button')).toThrow(/Unsupported selector/);
    });
  });

  it('rejects viewport dimensions that normalize below one cell', () => {
    const queries = createQueryEngine(() => text('Content'), () => ({ cols: 0.5, rows: 10 }));
    expect(() => queries.queryByText('Content')).toThrow(/at least 1 cell/i);
  });

  describe('getAllByTestId', () => {
    it('returns all matches for a repeated test ID', () => {
      handle = createTestApp(
        simpleApp(() => column(testId('item', text('First')), testId('item', text('Second')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.getAllByTestId('item');
      expect(results.map((result: { text: string }) => result.text)).toEqual(['First', 'Second']);
    });

    it('throws when no elements match the test ID', () => {
      handle = createTestApp(
        simpleApp(() => text('No IDs')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.getAllByTestId('missing')).toThrow(/Unable to find any elements with test ID/);
    });
  });

  describe('queryAllByTestId', () => {
    it('returns an empty array when no elements match', () => {
      handle = createTestApp(
        simpleApp(() => text('No IDs')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(screen.queryAllByTestId('missing')).toEqual([]);
    });
  });

  // ── getByRole ──────────────────────────────────────────────────────

  describe('getByRole', () => {
    it('finds element by ARIA role', () => {
      handle = createTestApp(
        simpleApp(() => a11y({ role: 'button' }, text('Click Me'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByRole('button');
      expect(result.role).toBe('button');
    });

    it('throws when role not found', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.getByRole('dialog')).toThrow(/Unable to find.*role.*dialog/);
    });

    it('finds by role with name filter', () => {
      handle = createTestApp(
        simpleApp(() => column(a11y({ role: 'button', label: 'Save' }, text('Save')), a11y({ role: 'button', label: 'Cancel' }, text('Cancel')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByRole('button', { name: 'Save' });
      expect(result.a11y?.label).toBe('Save');
    });

    it('skips aria-hidden role matches by default', () => {
      handle = createTestApp(
        simpleApp(() =>
          column(
            a11y({ role: 'button', label: 'Hidden', hidden: true }, text('Hidden Button')),
            a11y({ role: 'button', label: 'Visible' }, text('Visible Button')),
          ),
        ),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByRole('button');
      expect(result.a11y?.label).toBe('Visible');
    });

    it('can include aria-hidden role matches when requested', () => {
      handle = createTestApp(
        simpleApp(() => a11y({ role: 'button', label: 'Hidden', hidden: true }, text('Hidden Button'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByRole('button', { hidden: true });
      expect(result.a11y?.label).toBe('Hidden');
    });
  });

  describe('queryAllByRole', () => {
    it('returns all visible role matches', () => {
      handle = createTestApp(
        simpleApp(() => column(a11y({ role: 'button', label: 'Save' }, text('Save')), a11y({ role: 'button', label: 'Cancel' }, text('Cancel')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.queryAllByRole('button');
      expect(results.map((result: { text: string }) => result.text)).toEqual(['Save', 'Cancel']);
    });

    it('applies the name filter', () => {
      handle = createTestApp(
        simpleApp(() => column(a11y({ role: 'button', label: 'Save' }, text('Save')), a11y({ role: 'button', label: 'Cancel' }, text('Cancel')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.queryAllByRole('button', { name: 'Save' });
      expect(results.map((result: { text: string }) => result.text)).toEqual(['Save']);
    });

    it('skips aria-hidden role matches by default', () => {
      handle = createTestApp(
        simpleApp(() =>
          column(a11y({ role: 'button', label: 'Hidden', hidden: true }, text('Hidden')), a11y({ role: 'button', label: 'Visible' }, text('Visible'))),
        ),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.queryAllByRole('button');
      expect(results.map((result: { text: string }) => result.text)).toEqual(['Visible']);
    });

    it('includes aria-hidden role matches when requested', () => {
      handle = createTestApp(
        simpleApp(() =>
          column(a11y({ role: 'button', label: 'Hidden', hidden: true }, text('Hidden')), a11y({ role: 'button', label: 'Visible' }, text('Visible'))),
        ),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.queryAllByRole('button', { hidden: true });
      expect(results.map((result: { text: string }) => result.text)).toEqual(['Hidden', 'Visible']);
    });

    it('returns an empty array when no roles match', () => {
      handle = createTestApp(
        simpleApp(() => text('Nothing here')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(screen.queryAllByRole('button')).toEqual([]);
    });
  });

  // ── getByLabel ─────────────────────────────────────────────────────

  describe('getByLabel', () => {
    it('finds element by ARIA label', () => {
      handle = createTestApp(
        simpleApp(() => a11y({ label: 'Search input' }, text('Search...'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByLabel('Search input');
      expect(result.a11y?.label).toBe('Search input');
    });

    it('supports regex matching', () => {
      handle = createTestApp(
        simpleApp(() => a11y({ label: 'Search input' }, text('Search...'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByLabel(/search/i);
      expect(result.a11y?.label).toBe('Search input');
    });

    it('throws when label not found', () => {
      handle = createTestApp(
        simpleApp(() => text('Hello')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.getByLabel('missing')).toThrow(/Unable to find.*label/);
    });

    it('ignores aria-hidden labeled nodes by default', () => {
      handle = createTestApp(
        simpleApp(() => column(a11y({ label: 'Search input', hidden: true }, text('Hidden Search')), a11y({ label: 'Search input' }, text('Visible Search')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByLabel('Search input');
      expect(result.text).toBe('Visible Search');
    });

    it('returns null for hidden-only labels unless hidden is requested', () => {
      handle = createTestApp(
        simpleApp(() => a11y({ label: 'Secret field', hidden: true }, text('Secret'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(screen.queryByLabel('Secret field')).toBeNull();
    });

    it('can include hidden labels when requested', () => {
      handle = createTestApp(
        simpleApp(() => a11y({ label: 'Secret field', hidden: true }, text('Secret'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const result = screen.getByLabel('Secret field', { hidden: true });
      expect(result.text).toBe('Secret');
    });
  });

  describe('getAllByLabel', () => {
    it('returns all visible label matches', () => {
      handle = createTestApp(
        simpleApp(() => column(a11y({ label: 'Item' }, text('First')), a11y({ label: 'Item' }, text('Second')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.getAllByLabel('Item');
      expect(results.map((result: { text: string }) => result.text)).toEqual(['First', 'Second']);
    });

    it('skips hidden labels by default', () => {
      handle = createTestApp(
        simpleApp(() => column(a11y({ label: 'Item', hidden: true }, text('Hidden')), a11y({ label: 'Item' }, text('Visible')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.getAllByLabel('Item');
      expect(results.map((result: { text: string }) => result.text)).toEqual(['Visible']);
    });

    it('includes hidden labels when requested', () => {
      handle = createTestApp(
        simpleApp(() => column(a11y({ label: 'Item', hidden: true }, text('Hidden')), a11y({ label: 'Item' }, text('Visible')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      const results = screen.getAllByLabel('Item', { hidden: true });
      expect(results.map((result: { text: string }) => result.text)).toEqual(['Hidden', 'Visible']);
    });

    it('throws when no labels match', () => {
      handle = createTestApp(
        simpleApp(() => text('Nothing here')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(() => screen.getAllByLabel('Missing')).toThrow(/Unable to find any elements with label/);
    });
  });

  describe('queryAllByLabel', () => {
    it('returns an empty array when no labels match', () => {
      handle = createTestApp(
        simpleApp(() => text('Nothing here')),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(screen.queryAllByLabel('Missing')).toEqual([]);
    });
  });

  // ── getByText with row layout ──────────────────────────────────────

  describe('getByText with complex layouts', () => {
    it('finds text in a row layout', () => {
      handle = createTestApp(
        simpleApp(() => row(text('Left'), text('Right'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(screen.getByText('Left').text).toBe('Left');
      expect(screen.getByText('Right').text).toBe('Right');
    });

    it('finds text in nested layouts', () => {
      handle = createTestApp(
        simpleApp(() => column(row(text('A'), text('B')), row(text('C'), text('D')))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);
      expect(screen.getByText('A').text).toBe('A');
      expect(screen.getByText('D').text).toBe('D');
    });

    it('uses live terminal dimensions after a resize', () => {
      handle = createTestApp(
        simpleApp(() => component((context) => text((context?.container.cols ?? 80) >= 20 ? 'wide surface' : 'compact'))),
        { cols: 40, rows: 10 },
      );
      const screen = createScreen(handle);

      expect(screen.getByText('wide surface').text).toBe('wide surface');
      screen.fireResize(10, 10);
      expect(screen.queryByText('wide surface')).toBeNull();
      expect(screen.getByText('compact').text).toBe('compact');
    });

    it('reports grapheme text and terminal-cell width without phantom continuation spaces', () => {
      handle = createTestApp(simpleApp(() => text('界🙂Z')), { cols: 20, rows: 5 });
      const result = createScreen(handle).getByText('界🙂Z');

      expect(result.text).toBe('界🙂Z');
      expect(result.width).toBe(5);
    });

    it('queries metadata through resolved modern VNode wrappers and portals', () => {
      const never = new Promise<() => VNode>(() => {});
      handle = createTestApp(
        simpleApp(() =>
          column(
            memo(() => testId('memo-child', text('memo child')), []),
            suspense(testId('resolved-child', text('resolved child')), text('fallback'), true),
            localState('query-state', () => 'local child', (_state: string, next: string) => next, (state) => testId('local-child', text(state))),
            lazy('query-lazy', () => never, testId('lazy-placeholder', text('lazy placeholder'))),
            tabGroup('query-tabs', [testId('tab-child', text('tab child'))]),
            animated('portal-target', text('portal target')),
            portal('portal-target', testId('portal-child', text('portal child'))),
          ),
        ),
        { cols: 40, rows: 12 },
      );
      const screen = createScreen(handle);

      for (const id of ['memo-child', 'resolved-child', 'local-child', 'lazy-placeholder', 'tab-child', 'portal-child']) {
        expect(screen.getByTestId(id).testId).toBe(id);
      }
    });

    it('treats global regular expressions as reusable matchers', () => {
      handle = createTestApp(simpleApp(() => column(text('match one'), text('match two'))), { cols: 20, rows: 5 });
      const matcher = /match/gu;
      const screen = createScreen(handle);

      expect(screen.getAllByText(matcher)).toHaveLength(2);
      expect(screen.getAllByText(matcher)).toHaveLength(2);
      expect(matcher.lastIndex).toBe(0);
    });
  });
});
