/**
 * token-guard.test.js — enforces the design-token hard rule.
 *
 * All CSS outside the tokens:begin/end markers in src/styles.css, and every
 * <style> block in src/**\/*.svelte, must reference tier-2 semantic tokens
 * only. No literal colors, no literal font sizes, no var() fallbacks.
 *
 * Why var() fallbacks are banned: `var(--accent-color, #3498db)` is how the
 * app grew a second, undeclared palette that painted production surfaces for
 * months. A token either exists in the token block or the reference is a bug —
 * a fallback silently hides the bug.
 *
 * To allow a justified exception, add an entry to ALLOWLIST below with a
 * comment explaining why.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(import.meta.dirname, '..', 'src');

/** @type {{file: string, pattern: RegExp, reason: string}[]} */
const ALLOWLIST = [
  // (none yet)
];

const CHECKS = [
  { name: 'hex color literal', re: /#[0-9a-fA-F]{3,8}\b/g },
  { name: 'rgb()/rgba()/hsl() literal', re: /\b(?:rgba?|hsla?|hsl)\(/g },
  { name: 'font-size literal', re: /font-size:\s*[\d.]+(?:px|rem|em|pt|%)/g },
  { name: 'var() fallback', re: /var\(\s*--[\w-]+\s*,/g },
];

function violations(css, file) {
  const out = [];
  const lines = css.split('\n');
  lines.forEach((line, i) => {
    for (const { name, re } of CHECKS) {
      re.lastIndex = 0;
      const m = re.exec(line);
      if (!m) continue;
      const allowed = ALLOWLIST.some(
        (a) => file.includes(a.file) && a.pattern.test(line)
      );
      if (!allowed) out.push(`${file}:${i + 1} [${name}] ${line.trim()}`);
    }
  });
  return out;
}

function svelteFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...svelteFiles(p));
    else if (name.endsWith('.svelte')) out.push(p);
  }
  return out;
}

describe('design token guard', () => {
  it('styles.css has the token markers', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    expect(css).toContain('/* tokens:begin */');
    expect(css).toContain('/* tokens:end */');
  });

  it('styles.css outside the token block uses only semantic tokens', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    const body = css.split('/* tokens:end */')[1];
    expect(violations(body, 'src/styles.css')).toEqual([]);
  });

  it('component <style> blocks use only semantic tokens', () => {
    const all = [];
    for (const f of svelteFiles(SRC)) {
      const src = readFileSync(f, 'utf8');
      const m = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
      if (!m) continue;
      all.push(...violations(m[1], relative(join(SRC, '..'), f)));
    }
    expect(all).toEqual([]);
  });

  it('every var() reference outside the token block resolves to a defined token', () => {
    const css = readFileSync(join(SRC, 'styles.css'), 'utf8');
    const tokenBlock = css.split('/* tokens:begin */')[1].split('/* tokens:end */')[0];
    const defined = new Set(
      [...tokenBlock.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])
    );

    const unresolved = [];
    const check = (blockCss, file) => {
      // vars defined locally in this block (e.g. .f3 chart vars, --panel-sheet)
      const local = new Set(
        [...blockCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1])
      );
      for (const m of blockCss.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (!defined.has(m[1]) && !local.has(m[1]))
          unresolved.push(`${file}: var(${m[1]})`);
      }
    };

    check(css.split('/* tokens:end */')[1], 'src/styles.css');
    for (const f of svelteFiles(SRC)) {
      const src = readFileSync(f, 'utf8');
      const m = src.match(/<style[^>]*>([\s\S]*?)<\/style>/);
      if (m) check(m[1], relative(join(SRC, '..'), f));
    }
    expect(unresolved).toEqual([]);
  });
});
