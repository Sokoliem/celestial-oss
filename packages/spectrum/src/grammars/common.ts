import type { StateRule } from '../types.js';

export function cStyleBlockComment(): StateRule {
  return {
    name: 'blockComment',
    begin: /\/\*/y,
    end: /\*\//y,
    token: 'comment',
    contentToken: 'comment',
  };
}

export function htmlBlockComment(): StateRule {
  return {
    name: 'blockComment',
    begin: /<!--/y,
    end: /-->/y,
    token: 'comment',
    contentToken: 'comment',
  };
}

export function luaBlockComment(): StateRule {
  return {
    name: 'blockComment',
    begin: /--\[\[/y,
    end: /\]\]/y,
    token: 'comment',
    contentToken: 'comment',
  };
}

export function ocamlBlockComment(): StateRule {
  return {
    name: 'blockComment',
    begin: /\(\*/y,
    end: /\*\)/y,
    token: 'comment',
    contentToken: 'comment',
  };
}
