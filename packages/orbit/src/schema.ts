import {
  ARG_SCHEMA_ZOD,
  type ArgField,
  type ArgSchema,
  type SchemaValidationIssue,
  type SchemaValidationResult,
  type VisibilityPredicate,
} from './schema-types.js';

function pathToString(path: readonly (string | number)[]): string {
  return path.reduce<string>((result, segment) => {
    if (typeof segment === 'number') {
      return `${result}[${segment}]`;
    }
    return result.length === 0 ? segment : `${result}.${segment}`;
  }, '');
}

function appendVisibilityReferences(predicate: VisibilityPredicate, sink: string[]): void {
  if ('field' in predicate) {
    sink.push(predicate.field);
    return;
  }

  if ('all' in predicate) {
    for (const child of predicate.all) {
      appendVisibilityReferences(child, sink);
    }
    return;
  }

  if ('any' in predicate) {
    for (const child of predicate.any) {
      appendVisibilityReferences(child, sink);
    }
    return;
  }

  appendVisibilityReferences(predicate.not, sink);
}

function collectSemanticIssues(schema: ArgSchema): SchemaValidationIssue[] {
  const issues: SchemaValidationIssue[] = [];
  const seenNames = new Set<string>();
  const fieldNames = new Set(schema.fields.map((field) => field.name));

  for (const [index, field] of schema.fields.entries()) {
    if (seenNames.has(field.name)) {
      issues.push({
        path: `fields[${index}].name`,
        message: 'Field names must be unique',
      });
    }
    seenNames.add(field.name);

    if (field.kind === 'enum' || field.kind === 'multiEnum') {
      const optionValues = new Set<string>();
      for (const [optionIndex, option] of field.options.entries()) {
        if (optionValues.has(option.value)) {
          issues.push({
            path: `fields[${index}].options[${optionIndex}].value`,
            message: 'Option values must be unique',
          });
        }
        optionValues.add(option.value);
      }
    }

    if (field.visibleWhen) {
      const references: string[] = [];
      appendVisibilityReferences(field.visibleWhen, references);
      for (const reference of references) {
        if (!fieldNames.has(reference)) {
          issues.push({
            path: `fields[${index}].visibleWhen`,
            message: `Unknown field reference "${reference}"`,
          });
        }
      }
    }
  }

  for (const [index, section] of schema.layout?.sections?.entries() ?? []) {
    for (const fieldName of section.fields) {
      if (!fieldNames.has(fieldName)) {
        issues.push({
          path: `layout.sections[${index}].fields`,
          message: `Unknown field reference "${fieldName}"`,
        });
      }
    }
  }

  for (const [index, rule] of schema.validation?.rules?.entries() ?? []) {
    if (rule.kind === 'equal') {
      for (const reference of [rule.left, rule.right, rule.target]) {
        if (reference && !fieldNames.has(reference)) {
          issues.push({
            path: `validation.rules[${index}]`,
            message: `Unknown field reference "${reference}"`,
          });
        }
      }
      continue;
    }

    for (const reference of rule.fields) {
      if (!fieldNames.has(reference)) {
        issues.push({
          path: `validation.rules[${index}]`,
          message: `Unknown field reference "${reference}"`,
        });
      }
    }
  }

  return issues;
}

export function validateArgSchema(schema: unknown): SchemaValidationResult {
  const result = ARG_SCHEMA_ZOD.safeParse(schema);
  if (!result.success) {
    return {
      success: false,
      issues: result.error.issues.map((issue) => ({
        path: pathToString(issue.path),
        message: issue.message,
      })),
    };
  }

  const semanticIssues = collectSemanticIssues(result.data);
  if (semanticIssues.length > 0) {
    return {
      success: false,
      issues: semanticIssues,
    };
  }

  return {
    success: true,
    data: result.data,
  };
}

export function parseArgSchema(schema: unknown): ArgSchema {
  const result = validateArgSchema(schema);
  if (result.success) {
    return result.data;
  }

  throw new TypeError(result.issues.map((issue) => `${issue.path || 'schema'}: ${issue.message}`).join('\n'));
}

export type { ArgField, ArgSchema };
