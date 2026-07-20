import type { AppConfig } from '../app.js';

export function buildMigrate(
  strategy: 'auto-merge' | 'reset' | ((oldModel: unknown, freshModel: unknown) => unknown) | undefined,
  newConfig: AppConfig<any, any>,
): (oldModel: unknown) => unknown {
  if (strategy === 'reset') {
    return () => newConfig.init()[0];
  }
  if (typeof strategy === 'function') {
    return (old) => strategy(old, newConfig.init()[0]);
  }
  return (old) => {
    const [fresh] = newConfig.init();
    return { ...(fresh as any), ...(old as any) };
  };
}
