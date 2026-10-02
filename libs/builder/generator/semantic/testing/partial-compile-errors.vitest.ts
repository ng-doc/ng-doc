import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import nunjucks from 'nunjucks';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { TrackedFiles } from '../dependencies';
import { renderApiTemplate } from '../rendering';
import { join } from './engine-paths';

/**
 * Nunjucks 3.2.4 compiles an included/imported template lazily, inside
 * `Template#render(ctx, frame, cb)`, and reports its compile error through `asap`. Left alone, a
 * synchronous render returns partial output and the error escapes later as an uncaught exception.
 */
let directory: string;
const escaped: unknown[] = [];
const onUncaught = (error: unknown) => escaped.push(error);
const onUnhandled = (reason: unknown) => escaped.push(reason);
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'semantic-partial-errors-'));
  escaped.length = 0;
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onUnhandled);
});
afterEach(() => {
  process.off('uncaughtException', onUncaught);
  process.off('unhandledRejection', onUnhandled);
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});
const write = (name: string, text: string) => {
  mkdirSync(dirname(join(directory, name)), { recursive: true });
  writeFileSync(join(directory, name), text);
};
const path = (name: string) => join(directory, name);
/** Lets any `asap`/timer-deferred callback of the previous render run before asserting. */
const settle = () => new Promise((done) => setTimeout(done, 20));
const render = (name = 'main.nunj', context: object = {}) => {
  const files = new TrackedFiles();
  try {
    return { html: renderApiTemplate(name, context, directory, files, (text) => text), files };
  } catch (error) {
    return { error: error as Error, files };
  }
};
const reads = (files: TrackedFiles) =>
  files
    .all()
    .filter((item) => item.kind === 'content')
    .map((item) => ('path' in item ? item.path : ''))
    .sort();

test('a partial that fails to compile fails the render with its path and line; nothing escapes', async () => {
  write('main.nunj', 'ok\n{% include "part.nunj" %}\nafter');
  write('part.nunj', 'first line\nx{% if %}');
  const result = render();
  await settle();
  expect(escaped).toEqual([]);
  expect(result.html).toBeUndefined();
  // Nunjucks' own nesting: the including template, then the partial with its line and column.
  expect(String(result.error)).toBe(
    `Template render error: (${path('main.nunj')})\n` +
      `  Template render error: (${path('part.nunj')}) [Line 2, Column 8]\n` +
      '  unexpected token: %}',
  );
  // Both reads are recorded, so a watcher re-renders the page when the partial changes.
  expect(reads(result.files)).toEqual([path('main.nunj'), path('part.nunj')]);
});

test('a nested include reports the innermost partial; import, from-import and extends fail too', async () => {
  write('main.nunj', 'a{% include "sub/mid.nunj" %}b');
  write('sub/mid.nunj', 'm\n{% include "./deep.nunj" %}');
  write('sub/deep.nunj', 'line one\nline two\n{{ value }}{% for %}');
  const nested = render('main.nunj', { value: 'v' });
  write('import.nunj', '{% import "sub/deep.nunj" as d %}x');
  write('from.nunj', '{% from "sub/deep.nunj" import m %}x');
  write('extends.nunj', '{% extends "sub/deep.nunj" %}');
  const others = ['import.nunj', 'from.nunj', 'extends.nunj'].map((name) => render(name));
  await settle();
  expect(escaped).toEqual([]);
  expect(nested.html).toBeUndefined();
  const message = String(nested.error);
  expect(message).toContain(`(${path('main.nunj')})`);
  expect(message).toContain(`(${path('sub/mid.nunj')})`);
  expect(message).toContain(`(${path('sub/deep.nunj')}) [Line 3, Column 19]`);
  expect(reads(nested.files)).toEqual(
    [path('main.nunj'), path('sub/mid.nunj'), path('sub/deep.nunj')].sort(),
  );
  for (const other of others) {
    expect(other.html).toBeUndefined();
    expect(String(other.error)).toContain(`(${path('sub/deep.nunj')}) [Line 3, Column 19]`);
  }
});

test('an include that is not reached keeps rendering; a reached one fails', async () => {
  write('main.nunj', '{% if broken %}{% include "part.nunj" %}{% endif %}c');
  write('part.nunj', '{% if %}');
  expect(render('main.nunj', { broken: false }).html).toBe('c');
  expect(render('main.nunj', { broken: true }).error).toBeInstanceOf(Error);
  await settle();
  expect(escaped).toEqual([]);
});

test('with the compiled-template cache, a broken partial is never cached and recovers when fixed', async () => {
  const compile = vi.spyOn(
    (nunjucks as unknown as { compiler: { compile: (...args: unknown[]) => string } }).compiler,
    'compile',
  );
  write('main.nunj', '<{% include "part.nunj" %}>');
  write('part.nunj', 'good {{ value }}');
  expect(render('main.nunj', { value: 1 }).html).toBe('<good 1>');
  // Cached as success, then edited into a compile error: the edit is seen, not the cached code.
  write('part.nunj', 'good {% if %}');
  for (let round = 0; round < 2; round++) {
    const broken = render('main.nunj', { value: 2 });
    expect(broken.html).toBeUndefined();
    expect(String(broken.error)).toContain(`(${path('part.nunj')}) [Line 1, Column 12]`);
    expect(reads(broken.files)).toEqual([path('main.nunj'), path('part.nunj')]);
  }
  const compiledWhileBroken = compile.mock.calls.length;
  // Fixed (watch-mode edit): the next render compiles the new text and succeeds, then hits.
  write('part.nunj', 'fixed {{ value }}');
  expect(render('main.nunj', { value: 3 }).html).toBe('<fixed 3>');
  expect(compile).toHaveBeenCalledTimes(compiledWhileBroken + 1);
  expect(render('main.nunj', { value: 4 }).html).toBe('<fixed 4>');
  expect(compile).toHaveBeenCalledTimes(compiledWhileBroken + 1);
  await settle();
  expect(escaped).toEqual([]);
});
