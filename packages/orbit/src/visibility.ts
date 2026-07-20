/**
 * Visibility-predicate interop.
 *
 * Schema-form uses the declarative `VisibilityPredicate` grammar (field +
 * equals / notEquals / in / notIn / exists + all/any/not composition).
 * The legacy `form()` engine uses a free-form `visibleWhen: (values) =>
 * boolean` predicate. Consumers migrating from one to the other previously
 * had to rewrite their visibility logic.
 *
 * `predicateToVisibleWhen` lifts a `VisibilityPredicate` into a `visibleWhen`
 * function so callers can author once in the declarative grammar and reuse
 * it in either layer.
 */

import { jsonValuesEqual } from './schema-json.js';
import type { FormValueBag } from './types.js';
import type { JsonValue, VisibilityPredicate } from './schema-types.js';

/**
 * Evaluate a `VisibilityPredicate` against a value bag. Exposed as both a
 * direct helper (`evaluateVisibility(...)`) and as `predicateToVisibleWhen`
 * which returns the function-shape suitable for `FieldConfig.visibleWhen`.
 */
export function evaluateVisibility(predicate: VisibilityPredicate, values: FormValueBag): boolean {
  if ('field' in predicate) {
    const candidate = values[predicate.field] as JsonValue | undefined;
    const comparisons: boolean[] = [];

    if (predicate.exists !== undefined) {
      comparisons.push(predicate.exists ? candidate !== undefined && candidate !== null : candidate === undefined || candidate === null);
    }
    if (predicate.equals !== undefined) {
      comparisons.push(jsonValuesEqual((candidate ?? null) as JsonValue, predicate.equals));
    }
    if (predicate.notEquals !== undefined) {
      comparisons.push(!jsonValuesEqual((candidate ?? null) as JsonValue, predicate.notEquals));
    }
    if (predicate.in !== undefined) {
      comparisons.push(predicate.in.some((value) => jsonValuesEqual((candidate ?? null) as JsonValue, value)));
    }
    if (predicate.notIn !== undefined) {
      comparisons.push(predicate.notIn.every((value) => !jsonValuesEqual((candidate ?? null) as JsonValue, value)));
    }

    return comparisons.every(Boolean);
  }

  if ('all' in predicate) {
    return predicate.all.every((child) => evaluateVisibility(child, values));
  }
  if ('any' in predicate) {
    return predicate.any.some((child) => evaluateVisibility(child, values));
  }
  return !evaluateVisibility(predicate.not, values);
}

/**
 * Lift a declarative `VisibilityPredicate` into a `(values) => boolean`
 * function for use on `FieldConfig.visibleWhen` (or anywhere a predicate
 * function is expected).
 */
export function predicateToVisibleWhen(predicate: VisibilityPredicate): (values: FormValueBag) => boolean {
  return (values: FormValueBag) => evaluateVisibility(predicate, values);
}
