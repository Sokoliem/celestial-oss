/**
 * Screen wrapper for Telescope.
 *
 * Wraps a TestAppHandle to provide query methods, assertions,
 * event simulation, and async utilities — all in one object.
 */

import type { AriaRole, VNode } from '@celestial/core/nebula';
import {
  waitFor as asyncWaitFor,
  waitForAnnouncement as asyncWaitForAnnouncement,
  waitForFocusChange as asyncWaitForFocusChange,
  waitForPredicate as asyncWaitForPredicate,
  waitForElementToBeRemoved as asyncWaitForRemoved,
  waitForText as asyncWaitForText,
} from './async.js';
import { fireMouse as eventFireMouse, firePaste as eventFirePaste, fireResize as eventFireResize } from './events.js';
import { createQueryEngine, type LabelQueryOptions, type QueryEngine, type RoleQueryOptions } from './queries.js';
import type { TestAppHandle } from './test-app.js';
import type { AccessibilityAnnouncement, FocusEventRecord, MouseEventOptions, QueryResult, TextMatch, WaitOptions } from './types.js';

export interface Screen extends QueryEngine {
  /** The underlying test app handle */
  handle: TestAppHandle<unknown, unknown>;

  /** Get the plain text of the last rendered frame */
  lastFrame(): string;

  /** Wait for a callback to not throw (poll-based) */
  waitFor(callback: () => void, options?: WaitOptions): Promise<void>;

  /** Wait for specific text to appear */
  waitForText(matcher: TextMatch, options?: WaitOptions): Promise<QueryResult>;

  /** Wait for a custom predicate to become true */
  waitForPredicate(predicate: () => boolean, options?: WaitOptions): Promise<void>;

  /** Wait for an element to be removed */
  waitForElementToBeRemoved(callback: () => QueryResult | null, options?: WaitOptions): Promise<void>;

  /** Wait for a runtime accessibility announcement */
  waitForAnnouncement(matcher: TextMatch, options?: WaitOptions): Promise<AccessibilityAnnouncement>;

  /** Wait for a runtime focus change */
  waitForFocusChange(matcher: string | RegExp | null, options?: WaitOptions): Promise<FocusEventRecord>;

  /** Send a mouse event */
  fireMouse(options: MouseEventOptions): void;

  /** Simulate a terminal resize */
  fireResize(cols: number, rows: number): void;

  /** Simulate a bracketed paste */
  firePaste(content: string): void;

  /** Captured runtime accessibility announcements */
  announcements(): readonly AccessibilityAnnouncement[];

  /** Captured runtime focus change events */
  focusEvents(): readonly FocusEventRecord[];

  /** Get all visible text in the current frame */
  debug(): string;
}

/**
 * Create a Screen wrapper around a TestAppHandle.
 * Provides Testing Library-style queries and utilities.
 */
export function createScreen<Model, M>(handle: TestAppHandle<Model, M>): Screen {
  // The query engine needs a function that returns the current view
  const queryEngine = createQueryEngine(
    () => {
      // Get the current view from the app config
      // We access the model and call the view function
      return (handle as unknown as { _getView(): VNode })._getView ? (handle as unknown as { _getView(): VNode })._getView() : getViewFromHandle(handle);
    },
    () => handle.terminal.getSize(),
  );

  function getViewFromHandle<Mo, Mg>(h: TestAppHandle<Mo, Mg>): VNode {
    // The view is stored on the config. We reach through the handle
    // to call config.view(model). Since TestAppHandle doesn't expose
    // the config directly, we use the __config property we'll add.
    const internal = h as unknown as { __config?: { view: (m: Mo) => VNode } };
    if (internal.__config) {
      return internal.__config.view(h.model);
    }
    // Fallback: parse the lastFrame text into a text node
    // This is less ideal but works as a baseline
    throw new Error('Screen requires access to the app config view function. ' + 'Make sure createTestApp exposes __config.');
  }

  return {
    handle: handle as TestAppHandle<unknown, unknown>,

    // Query methods (delegated)
    getByText: (m) => queryEngine.getByText(m),
    getAllByText: (m) => queryEngine.getAllByText(m),
    queryByText: (m) => queryEngine.queryByText(m),
    queryAllByText: (m) => queryEngine.queryAllByText(m),
    getByTestId: (id) => queryEngine.getByTestId(id),
    getAllByTestId: (id) => queryEngine.getAllByTestId(id),
    queryByTestId: (id) => queryEngine.queryByTestId(id),
    queryAllByTestId: (id) => queryEngine.queryAllByTestId(id),
    getByRole: (role: AriaRole, opts?: RoleQueryOptions) => queryEngine.getByRole(role, opts),
    getAllByRole: (role: AriaRole, opts?: RoleQueryOptions) => queryEngine.getAllByRole(role, opts),
    queryByRole: (role: AriaRole, opts?: RoleQueryOptions) => queryEngine.queryByRole(role, opts),
    queryAllByRole: (role: AriaRole, opts?: RoleQueryOptions) => queryEngine.queryAllByRole(role, opts),
    getByLabel: (m, opts?: LabelQueryOptions) => queryEngine.getByLabel(m, opts),
    getAllByLabel: (m, opts?: LabelQueryOptions) => queryEngine.getAllByLabel(m, opts),
    queryByLabel: (m, opts?: LabelQueryOptions) => queryEngine.queryByLabel(m, opts),
    queryAllByLabel: (m, opts?: LabelQueryOptions) => queryEngine.queryAllByLabel(m, opts),
    getBySelector: (selector) => queryEngine.getBySelector(selector),
    getAllBySelector: (selector) => queryEngine.getAllBySelector(selector),
    queryBySelector: (selector) => queryEngine.queryBySelector(selector),
    queryAllBySelector: (selector) => queryEngine.queryAllBySelector(selector),

    lastFrame() {
      return handle.lastFrame();
    },

    async waitFor(callback: () => void, options?: WaitOptions): Promise<void> {
      return asyncWaitFor(callback, options);
    },

    async waitForText(matcher: TextMatch, options?: WaitOptions): Promise<QueryResult> {
      return asyncWaitForText(() => queryEngine.getByText(matcher), options);
    },

    async waitForPredicate(predicate: () => boolean, options?: WaitOptions): Promise<void> {
      return asyncWaitForPredicate(predicate, options);
    },

    async waitForElementToBeRemoved(callback: () => QueryResult | null, options?: WaitOptions): Promise<void> {
      return asyncWaitForRemoved(callback, options);
    },

    async waitForAnnouncement(matcher: TextMatch, options?: WaitOptions): Promise<AccessibilityAnnouncement> {
      return asyncWaitForAnnouncement(() => handle.announcements(), matcher, options);
    },

    async waitForFocusChange(matcher: string | RegExp | null, options?: WaitOptions): Promise<FocusEventRecord> {
      return asyncWaitForFocusChange(() => handle.focusEvents(), matcher, options);
    },

    fireMouse(options: MouseEventOptions): void {
      eventFireMouse(handle.terminal, options);
    },

    fireResize(newCols: number, newRows: number): void {
      eventFireResize(handle.terminal, newCols, newRows);
    },

    firePaste(content: string): void {
      eventFirePaste(handle.terminal, content);
    },

    announcements(): readonly AccessibilityAnnouncement[] {
      return handle.announcements();
    },

    focusEvents(): readonly FocusEventRecord[] {
      return handle.focusEvents();
    },

    debug(): string {
      return handle.lastFrame();
    },
  };
}
