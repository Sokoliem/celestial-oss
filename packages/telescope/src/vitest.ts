import type { AriaRole, StyleAttrs } from '@celestial/core/nebula';
import { expect } from 'vitest';
import type { Screen } from './screen.js';
import type { QueryResult } from './types.js';

interface CelestialMatchers<R = unknown> {
  toContainText(text: string): R;
  toHaveStyle(expected: Partial<StyleAttrs>): R;
  toHaveFocus(): R;
  toBeVisible(): R;
  toHaveRole(role: AriaRole): R;
  toMatchTerminalSnapshot(name?: string): R;
}

declare module 'vitest' {
  interface Assertion<T> extends CelestialMatchers<T> {}
  interface AsymmetricMatchersContaining extends CelestialMatchers {}
}

let installed = false;

export function installCelestialMatchers(): void {
  if (installed) return;
  installed = true;

  expect.extend({
    toContainText(received: Screen | QueryResult, expectedText: string) {
      const actual = 'lastFrame' in received ? received.lastFrame() : received.text;
      const pass = actual.includes(expectedText);
      return {
        pass,
        message: () =>
          pass
            ? `Expected output not to contain ${JSON.stringify(expectedText)}.`
            : `Expected output to contain ${JSON.stringify(expectedText)}.\nReceived:\n${actual}`,
      };
    },

    toHaveStyle(received: QueryResult, expected: Partial<StyleAttrs>) {
      const style = received.style ?? {};
      const mismatches = Object.entries(expected).filter(([key, value]) => (style as Record<string, unknown>)[key] !== value);
      const pass = mismatches.length === 0;
      return {
        pass,
        message: () =>
          pass
            ? `Expected element not to have style ${JSON.stringify(expected)}.`
            : `Style mismatch: ${mismatches.map(([key, value]) => `${key}=${JSON.stringify(value)}`).join(', ')}`,
      };
    },

    toHaveFocus(received: QueryResult) {
      const pass = received.focused === true;
      return {
        pass,
        message: () => (pass ? 'Expected element not to have focus.' : `Expected ${JSON.stringify(received.text)} to have focus.`),
      };
    },

    toBeVisible(received: QueryResult) {
      const pass = received.a11y?.hidden !== true;
      return {
        pass,
        message: () => (pass ? 'Expected element not to be visible.' : `Expected ${JSON.stringify(received.text)} to be visible.`),
      };
    },

    toHaveRole(received: QueryResult, role: AriaRole) {
      const pass = received.role === role;
      return {
        pass,
        message: () =>
          pass
            ? `Expected element not to have role ${JSON.stringify(role)}.`
            : `Expected role ${JSON.stringify(role)}, received ${JSON.stringify(received.role)}.`,
      };
    },

    toMatchTerminalSnapshot(received: Screen, name?: string) {
      const frame = received.lastFrame();
      try {
        if (name) expect(frame).toMatchSnapshot(name);
        else expect(frame).toMatchSnapshot();
        return { pass: true, message: () => 'Expected terminal snapshot not to match.' };
      } catch (error) {
        return {
          pass: false,
          message: () => (error instanceof Error ? error.message : 'Terminal snapshot did not match.'),
        };
      }
    },
  });
}

installCelestialMatchers();
