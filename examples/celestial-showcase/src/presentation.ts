import type { Style, ThemeInput } from '@celestial/core/corona';
import { semanticStyles, type SemanticStyles } from '@celestial/ui';

let current: SemanticStyles = semanticStyles();

function liveStyle(key: keyof SemanticStyles): Style {
  return new Proxy({} as Style, {
    get: (_target, property) =>
      Reflect.get(current[key] as object, property),
    has: (_target, property) =>
      Reflect.has(current[key] as object, property),
    ownKeys: () => Reflect.ownKeys(current[key] as object),
    getOwnPropertyDescriptor: (_target, property) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(
        current[key] as object,
        property,
      );
      return descriptor === undefined
        ? undefined
        : { ...descriptor, configurable: true };
    },
  });
}

export const bodyStyle = liveStyle('body');
export const titleStyle = liveStyle('title');
export const labelStyle = liveStyle('label');
export const headingStyle = liveStyle('heading');
export const mutedStyle = liveStyle('muted');
export const actionStyle = liveStyle('action');
export const infoStyle = liveStyle('info');
export const successStyle = liveStyle('success');
export const warningStyle = liveStyle('warning');
export const dangerStyle = liveStyle('danger');

export function setShowcasePresentationTheme(theme: ThemeInput): void {
  current = semanticStyles({ theme });
}
