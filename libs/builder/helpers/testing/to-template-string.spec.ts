import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { renderTemplate } from '../../engine/nunjucks/render-template';
import { toTemplateString } from '../to-template-string';

/**
 * Evaluates TypeScript source as a module and returns its exports; fails on any syntax error.
 * @param source - The module text.
 */
function evaluate(source: string): Record<string, unknown> {
  const transpiled = ts.transpileModule(source, {
    reportDiagnostics: true,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  expect(transpiled.diagnostics ?? []).toEqual([]);
  const exports: Record<string, unknown> = {};
  new Function('exports', 'require', transpiled.outputText)(exports, () => ({}));
  return exports;
}

const SAMPLES = [
  'content: "\\203A";',
  'const digits = /\\d+/;',
  "const lines = 'a\\nb';",
  "const slash = '\\\\';",
  'const tick = `${slash}\\``;',
  'a trailing backslash \\',
  '{ braces } and ${placeholders}',
];

describe('toTemplateString', () => {
  it.each(SAMPLES)('makes a template literal that evaluates to %s', (sample) => {
    expect(evaluate(`export const value = \`${toTemplateString(sample)}\`;`)['value']).toBe(sample);
  });

  it('keeps an absent value empty', () => {
    expect(toTemplateString(undefined as unknown as string)).toBe('');
  });

  it("gives the legacy engine's demo assets the exact code of each asset", () => {
    const code = SAMPLES.join('\n');
    const module = renderTemplate('./demo-assets.ts.nunj', {
      context: { demoAssets: { DemoComponent: [{ title: 'TypeScript', code, isEmpty: false }] } },
    });

    expect(evaluate(module)['demoAssets']).toEqual({
      DemoComponent: [{ title: 'TypeScript', code }],
    });
  });
});
