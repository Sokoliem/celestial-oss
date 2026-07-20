/**
 * Language Detection Tests
 *
 * Tests for detecting supported spectrum languages from file paths and shebangs.
 */

import { describe, expect, it } from 'vitest';
import { detectLanguage, detectLanguageFromShebang } from '../language-detect.js';

describe('detectLanguage', () => {
  it('detects supported languages from common extensions', () => {
    expect(detectLanguage('src/index.ts')).toBe('typescript');
    expect(detectLanguage('scripts/main.py')).toBe('python');
    expect(detectLanguage('styles/theme.css')).toBe('css');
    expect(detectLanguage('styles/theme.scss')).toBe('scss');
    expect(detectLanguage('Cargo.toml')).toBe('toml');
  });

  it('detects extensionless supported basenames', () => {
    expect(detectLanguage('Dockerfile')).toBe('dockerfile');
    expect(detectLanguage('Makefile')).toBe('makefile');
    expect(detectLanguage('.gitignore')).toBe('gitignore');
  });

  it('normalizes supported aliases to canonical language names', () => {
    expect(detectLanguage('components/App.tsx')).toBe('typescript');
    expect(detectLanguage('config.jsonc')).toBe('json');
    expect(detectLanguage('public/index.svg')).toBe('html');
  });

  it('returns undefined for unknown inputs', () => {
    expect(detectLanguage('LICENSE')).toBeUndefined();
    expect(detectLanguage('data.xyz123')).toBeUndefined();
    expect(detectLanguage('')).toBeUndefined();
  });
});

describe('detectLanguageFromShebang', () => {
  it('detects supported interpreters from env-style shebangs', () => {
    expect(detectLanguageFromShebang('#!/usr/bin/env node')).toBe('javascript');
    expect(detectLanguageFromShebang('#!/usr/bin/env python3')).toBe('python');
    expect(detectLanguageFromShebang('#!/usr/bin/env bash')).toBe('bash');
  });

  it('detects supported interpreters from direct-path shebangs', () => {
    expect(detectLanguageFromShebang('#!/bin/sh')).toBe('bash');
    expect(detectLanguageFromShebang('#!/usr/bin/php')).toBe('php');
  });

  it('detects perl from shebang', () => {
    expect(detectLanguageFromShebang('#!/usr/bin/env perl')).toBe('perl');
  });

  it('returns undefined for non-shebang or unsupported interpreters', () => {
    expect(detectLanguageFromShebang('const x = 1;')).toBeUndefined();
    expect(detectLanguageFromShebang('#!/usr/bin/env brainfuck')).toBeUndefined();
  });
});
