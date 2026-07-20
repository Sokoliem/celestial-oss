/**
 * Safe math utilities that avoid `Math.min/max(...array)` which throws
 * RangeError on arrays larger than ~65K elements due to stack overflow
 * from spreading into function arguments.
 */

/**
 * Find the minimum value in an array without spreading.
 * Returns `Infinity` for empty arrays (matching Math.min() behavior).
 */
export function safeMin(arr: readonly number[]): number {
  let min = Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]! < min) min = arr[i]!;
  }
  return min;
}

/**
 * Find the maximum value in an array without spreading.
 * Returns `-Infinity` for empty arrays (matching Math.max() behavior).
 */
export function safeMax(arr: readonly number[]): number {
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]! > max) max = arr[i]!;
  }
  return max;
}

/**
 * Find both min and max in a single pass.
 * Returns `[Infinity, -Infinity]` for empty arrays.
 */
export function safeMinMax(arr: readonly number[]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}
