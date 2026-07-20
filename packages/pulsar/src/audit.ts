/**
 * Document Audit (B12)
 *
 * Returns structured findings for accessibility and quality issues:
 *   - broken anchor references
 *   - missing image alt text
 *   - heading-level skips
 *   - footnote-ref orphans
 *   - unknown fence languages
 *   - contrast warnings (via corona validateThemeContrast when available)
 *
 * Usage:
 *   const report = auditMarkdown(source, theme);
 *   report.passed // true if no errors
 *   report.findings // array of findings
 */

import { type SemanticTheme, validateThemeContrast } from '@celestial/corona';
import { parseMarkdown } from './parser/index.js';
import type { MarkdownTheme, Token } from './types.js';

export interface AuditFinding {
  readonly level: 'error' | 'warn' | 'info';
  readonly message: string;
  readonly blockIndex?: number;
}

export interface AuditReport {
  readonly findings: readonly AuditFinding[];
  readonly passed: boolean;
}

const KNOWN_FENCE_LANGUAGES = new Set([
  '',
  'text',
  'plain',
  'ts',
  'typescript',
  'js',
  'javascript',
  'jsx',
  'tsx',
  'json',
  'csv',
  'sql',
  'http',
  'xml',
  'yaml',
  'yml',
  'toml',
  'html',
  'css',
  'scss',
  'sass',
  'less',
  'sh',
  'bash',
  'zsh',
  'fish',
  'powershell',
  'pwsh',
  'py',
  'python',
  'rb',
  'ruby',
  'go',
  'rust',
  'rs',
  'c',
  'cpp',
  'cxx',
  'cc',
  'java',
  'kotlin',
  'kt',
  'swift',
  'scala',
  'php',
  'perl',
  'lua',
  'r',
  'matlab',
  'dart',
  'elm',
  'haskell',
  'hs',
  'clojure',
  'clj',
  'erlang',
  'erl',
  'elixir',
  'ex',
  'diff',
  'patch',
  'dockerfile',
  'docker',
  'makefile',
  'make',
  'cmake',
  'markdown',
  'md',
  'mdx',
  'graphql',
  'gql',
  'regex',
  'vim',
  'nginx',
  'apache',
  'mermaid',
  'dot',
  'chart',
  'sparkline',
  'gauge',
  'heatmap',
  'math',
  'latex',
  'live',
]);

export function auditMarkdown(input: string, theme?: MarkdownTheme | SemanticTheme): AuditReport {
  const tokens = parseMarkdown(input);
  const findings: AuditFinding[] = [];
  const headings = tokens.filter((t): t is Extract<Token, { type: 'heading' }> => t.type === 'heading');

  // Heading-level skips
  let prevLevel = 0;
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i]!;
    if (prevLevel > 0 && h.level > prevLevel + 1) {
      findings.push({
        level: 'info',
        message: `Heading level skip: h${prevLevel} → h${h.level}`,
        blockIndex: tokens.indexOf(h),
      });
    }
    prevLevel = h.level;
  }

  // Broken anchors: link targets that don't match any heading id
  const headingIds = new Set(headings.map((h) => h.id).filter(Boolean));
  const linkTargets = collectLinkTargets(tokens);
  for (const target of linkTargets) {
    if (target.startsWith('#') && !headingIds.has(target.slice(1))) {
      findings.push({
        level: 'warn',
        message: `Broken anchor reference: ${target}`,
      });
    }
  }

  // Missing image alt text
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === 'image' && !token.alt.trim()) {
      findings.push({
        level: 'warn',
        message: 'Image with missing alt text',
        blockIndex: i,
      });
    }
    if (token.type === 'paragraph' || token.type === 'heading') {
      for (const inline of token.content) {
        if (inline.type === 'image-inline' && !inline.alt.trim()) {
          findings.push({
            level: 'warn',
            message: 'Inline image with missing alt text',
            blockIndex: i,
          });
        }
      }
    }
  }

  // Unknown fence languages
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === 'code-block' && token.language && !KNOWN_FENCE_LANGUAGES.has(token.language.toLowerCase())) {
      findings.push({
        level: 'info',
        message: `Unknown fence language: ${token.language}`,
        blockIndex: i,
      });
    }
  }

  // Footnote orphans
  const footnoteLabels = new Set<string>();
  const footnoteRefs = new Set<string>();
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === 'footnote-def') {
      footnoteLabels.add(token.label);
    }
    collectFootnoteRefs(token, footnoteRefs);
  }
  for (const ref of footnoteRefs) {
    if (!footnoteLabels.has(ref)) {
      findings.push({
        level: 'warn',
        message: `Footnote reference without definition: [^${ref}]`,
      });
    }
  }
  for (const label of footnoteLabels) {
    if (!footnoteRefs.has(label)) {
      findings.push({
        level: 'info',
        message: `Footnote definition without reference: [^${label}]`,
      });
    }
  }

  if (isSemanticTheme(theme)) {
    try {
      const contrast = validateThemeContrast(theme);
      for (const violation of contrast.violations.slice(0, 10_000)) {
        findings.push({
          level: 'warn',
          message: `Theme contrast ${violation.pair}: ${violation.ratio.toFixed(2)} is below ${violation.required.toFixed(2)}`,
        });
      }
    } catch {
      findings.push({ level: 'warn', message: 'Theme contrast could not be validated' });
    }
  }

  const errors = findings.filter((f) => f.level === 'error');

  return { findings, passed: errors.length === 0 };
}

function isSemanticTheme(theme: MarkdownTheme | SemanticTheme | undefined): theme is SemanticTheme {
  return typeof theme === 'object' && theme !== null && 'colors' in theme && 'typography' in theme && 'glyphs' in theme;
}

function collectLinkTargets(tokens: readonly Token[]): string[] {
  const targets: string[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'paragraph':
      case 'heading':
        for (const inline of token.content) {
          if (inline.type === 'link') targets.push(inline.url);
          if (inline.type === 'wiki-link') targets.push(inline.target);
        }
        break;
      case 'blockquote':
      case 'admonition':
      case 'details':
      case 'footnote-def':
        targets.push(...collectLinkTargets(token.content));
        break;
      case 'list':
        for (const item of token.items) {
          for (const inline of item.content) {
            if (inline.type === 'link') targets.push(inline.url);
          }
          if (item.children) targets.push(...collectLinkTargets(item.children));
        }
        break;
    }
  }
  return targets;
}

function collectFootnoteRefs(token: Token, refs: Set<string>): void {
  switch (token.type) {
    case 'paragraph':
    case 'heading':
      for (const inline of token.content) {
        if (inline.type === 'footnote-ref') refs.add(inline.label);
      }
      break;
    case 'blockquote':
    case 'admonition':
    case 'details':
    case 'footnote-def':
      for (const child of token.content) collectFootnoteRefs(child, refs);
      break;
    case 'list':
      for (const item of token.items) {
        for (const inline of item.content) {
          if (inline.type === 'footnote-ref') refs.add(inline.label);
        }
        if (item.children) {
          for (const child of item.children) collectFootnoteRefs(child, refs);
        }
      }
      break;
  }
}
