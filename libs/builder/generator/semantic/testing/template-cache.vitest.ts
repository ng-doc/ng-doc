import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nunjucks from 'nunjucks';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { digest, TrackedFiles } from '../dependencies';
import { renderApiTemplate } from '../rendering';

let directory: string;
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'semantic-template-cache-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});
const write = (name: string, text: string) => writeFileSync(join(directory, name), text);
const render = (name = 'main.nunj', context: object = {}, markdown = (text: string) => text) => {
  const files = new TrackedFiles();
  const html = renderApiTemplate(name, context, directory, files, markdown);
  return { html, dependencies: files.all() };
};
const compiler = () =>
  (nunjucks as unknown as { compiler: { compile: (...args: unknown[]) => string } }).compiler;
const templateReads = (dependencies: ReturnType<typeof render>['dependencies']) =>
  dependencies.filter((item) => item.kind === 'content');

test('templates compile once per text; every render still records every template read', () => {
  write('main.nunj', '<main>{{ value }}{% include "part.nunj" %}{% include "part.nunj" %}</main>');
  write('part.nunj', '<i>{{ value | upper }}</i>');
  const compile = vi.spyOn(compiler(), 'compile');
  const first = render('main.nunj', { value: 'a' });
  expect(first.html).toBe('<main>a<i>A</i><i>A</i></main>');
  const compiledOnFirst = compile.mock.calls.length;
  expect(compiledOnFirst).toBeLessThanOrEqual(2);
  for (const value of ['b', 'c']) {
    const next = render('main.nunj', { value });
    expect(next.html).toBe(
      `<main>${value}<i>${value.toUpperCase()}</i><i>${value.toUpperCase()}</i></main>`,
    );
    // Cache hits record exactly the reads and digests of a compiling render.
    expect(next.dependencies).toEqual(first.dependencies);
  }
  expect(compile).toHaveBeenCalledTimes(compiledOnFirst);
  expect(templateReads(first.dependencies)).toEqual([
    {
      kind: 'content',
      path: join(directory, 'main.nunj'),
      digest: digest('<main>{{ value }}{% include "part.nunj" %}{% include "part.nunj" %}</main>'),
    },
    {
      kind: 'content',
      path: join(directory, 'part.nunj'),
      digest: digest('<i>{{ value | upper }}</i>'),
    },
  ]);
});

test('an edited template recompiles in the next render (generation) and reverting restores it', () => {
  write('main.nunj', '{% include "part.nunj" %}');
  write('part.nunj', 'old');
  const before = render();
  expect(before.html).toBe('old');
  write('part.nunj', 'new {{ 1 + 1 }}');
  const edited = render();
  expect(edited.html).toBe('new 2');
  expect(templateReads(edited.dependencies)).not.toEqual(templateReads(before.dependencies));
  expect(templateReads(edited.dependencies)[1]).toEqual({
    kind: 'content',
    path: join(directory, 'part.nunj'),
    digest: digest('new {{ 1 + 1 }}'),
  });
  write('part.nunj', 'old');
  expect(render()).toEqual(before);
});

test('cached code binds each render to its own filters and context', () => {
  write('main.nunj', '{{ text | markdownToHtml }}');
  expect(render('main.nunj', { text: 'x' }, (text) => `<p>${text}</p>`).html).toBe('<p>x</p>');
  expect(render('main.nunj', { text: 'y' }, (text) => `<em>${text}</em>`).html).toBe('<em>y</em>');
});

test('identical text at different paths keeps its own path in runtime errors', () => {
  const text = '{{ missing() }}';
  write('one.nunj', text);
  write('two.nunj', text);
  for (let round = 0; round < 2; round++) {
    expect(() => render('one.nunj')).toThrow(join(directory, 'one.nunj'));
    expect(() => render('two.nunj')).toThrow(join(directory, 'two.nunj'));
  }
});

test('a template that fails to compile fails exactly as uncached nunjucks and is never cached', () => {
  write('main.nunj', '{% if %}');
  const expected = (() => {
    try {
      new nunjucks.Environment(new nunjucks.FileSystemLoader(directory, { noCache: true }), {
        autoescape: false,
      }).render('main.nunj', {});
    } catch (error) {
      return String(error).replace(/\(unknown path\)|\([^)]*main\.nunj\)/, '(PATH)');
    }
    return 'no error';
  })();
  const failures = new TrackedFiles();
  for (let round = 0; round < 2; round++) {
    let message = 'no error';
    try {
      renderApiTemplate('main.nunj', {}, directory, failures, (text) => text);
    } catch (error) {
      message = String(error).replace(/\(unknown path\)|\([^)]*main\.nunj\)/, '(PATH)');
    }
    expect(message).toBe(expected);
    expect(message).toContain('Template render error');
  }
  // The failed read is still recorded, and the repaired template renders.
  expect(templateReads(failures.all())).toHaveLength(1);
  write('main.nunj', 'fixed');
  expect(render().html).toBe('fixed');
});
