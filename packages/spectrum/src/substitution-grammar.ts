import type { LanguageGrammar } from './types.js';

export function createSubstitutionGrammar(): LanguageGrammar {
  return {
    name: 'substitution',
    aliases: ['prompt-template', 'template-substitution'],
    rules: [
      { pattern: /\\\$\{/y, token: 'escape' },
      { pattern: /\$\{/y, token: 'punctuation', push: 'substitutionExpression' },
      { pattern: /[^\\$]+/y, token: 'text' },
      { pattern: /\\./y, token: 'escape' },
      { pattern: /\$/y, token: 'text' },
    ],
    states: [
      {
        name: 'substitutionExpression',
        begin: /(?!)/y,
        end: /\}/y,
        token: 'punctuation',
        contentToken: 'text',
        contentRules: [
          { pattern: /[a-zA-Z_][a-zA-Z_0-9.-]*/y, token: 'variable' },
          { pattern: /\s+/y, token: 'text' },
          { pattern: /\\./y, token: 'escape' },
          { pattern: /[^}\\\s]+/y, token: 'text' },
        ],
      },
    ],
  };
}

export const substitutionGrammar = createSubstitutionGrammar();
