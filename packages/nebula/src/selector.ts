export interface Selector<Model, Result> {
  (model: Model): Result;
  invalidate(): void;
}

export function createSelector<Model, Deps, Result>(
  extractDeps: (model: Model) => Deps,
  compute: (deps: Deps) => Result,
  isEqual?: (a: Deps, b: Deps) => boolean,
): Selector<Model, Result> {
  let hasCached = false;
  let cachedDeps: Deps | undefined;
  let cachedResult: Result | undefined;

  const equalFn = isEqual ?? ((a: Deps, b: Deps) => Object.is(a, b));

  const selector = ((model: Model): Result => {
    const deps = extractDeps(model);

    if (hasCached && equalFn(cachedDeps as Deps, deps)) {
      return cachedResult as Result;
    }

    cachedDeps = deps;
    cachedResult = compute(deps);
    hasCached = true;

    return cachedResult;
  }) as Selector<Model, Result>;

  selector.invalidate = (): void => {
    hasCached = false;
  };

  return selector;
}

export function composeSelectors<Model, A, B>(first: Selector<Model, A>, second: (a: A) => B): Selector<Model, B> {
  let hasCached = false;
  let cachedA: A | undefined;
  let cachedResult: B | undefined;

  const composed = ((model: Model): B => {
    const a = first(model);

    if (hasCached && Object.is(cachedA, a)) {
      return cachedResult as B;
    }

    cachedA = a;
    cachedResult = second(a);
    hasCached = true;
    return cachedResult;
  }) as Selector<Model, B>;

  composed.invalidate = (): void => {
    first.invalidate();
    hasCached = false;
  };

  return composed;
}
