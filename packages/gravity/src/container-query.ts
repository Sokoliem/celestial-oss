import { resolveWhen } from './responsive.js';
import { resolveResponsiveEnvironment } from './responsive-env.js';
import { resolveRuntimeMeasurementContext } from './runtime.js';
import type { AnyWhenCondition, ComponentNode, ContainerQueryRule, ResponsiveEnvironment, VNode } from './types.js';

function matchesCondition(width: number, condition: AnyWhenCondition): boolean {
  if (condition._tag === 'when-env') {
    return condition.test(resolveResponsiveEnvironment({ container: { cols: width, rows: 0 } }));
  }
  if (condition._tag === 'when-predicate') {
    return condition.test(width);
  }
  if (condition._tag === 'when-axis') {
    return resolveWhen(condition);
  }
  if (condition.min !== undefined && width < condition.min) return false;
  if (condition.max !== undefined && width > condition.max) return false;
  return true;
}

export interface ContainerQueryEnvRule {
  when: AnyWhenCondition | ((environment: ResponsiveEnvironment) => boolean);
  node: VNode;
}

function matchesEnvironment(environment: ResponsiveEnvironment, condition: ContainerQueryEnvRule['when']): boolean {
  if (typeof condition === 'function') {
    return condition(environment);
  }
  if (condition._tag === 'when-env') {
    return condition.test(environment);
  }
  return matchesCondition(environment.container.cols, condition);
}

export function containerQuery(node: VNode, rules: readonly ContainerQueryRule[]): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const measurementContext = resolveRuntimeMeasurementContext(renderContext);
      const selected = rules.find((rule) => matchesCondition(measurementContext.container.cols, rule.when));
      return selected?.node ?? node;
    },
  };
}

export function containerQueryEnv(node: VNode, rules: readonly ContainerQueryEnvRule[]): ComponentNode {
  return {
    kind: 'component',
    render: (renderContext): VNode => {
      const environment = resolveResponsiveEnvironment(renderContext);
      const selected = rules.find((rule) => matchesEnvironment(environment, rule.when));
      return selected?.node ?? node;
    },
  };
}
