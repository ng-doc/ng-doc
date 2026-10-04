import { Project } from 'ts-morph';
import { expect, test, vi } from 'vitest';

import type { GeneratorConfiguration } from '../../contracts';
import { projectWatchInputs } from '../../session/watch-inputs';
import { guideSemantics } from '../angular';
import { type TrackedFiles, normalize } from '../dependencies';
import type { JsDoc } from '../rendering';

// A Windows host, simulated on any OS: the engine and the shared helpers it calls build paths with
// the win32 rules, as `node:path` does on Windows, where a join gives backslashes. TypeScript and
// ts-morph are not transformed by Vitest and keep naming files with forward slashes, as they do on
// Windows.
vi.mock('node:path', async () => {
  const { win32 } = await vi.importActual<typeof import('node:path')>('node:path');
  return { ...win32, default: win32 };
});
vi.mock('path', async () => {
  const { win32 } = await vi.importActual<typeof import('node:path')>('node:path');
  return { ...win32, default: win32 };
});

const docs = 'D:/a/workspace/docs/guide';
const texts: Record<string, string> = {
  [`${docs}/ng-doc.page.ts`]: `import { Component } from '@angular/core';
@Component({ selector: 'demo-box', templateUrl: './demo.html', styleUrl: '../styles/demo.scss' })
export class Demo {}
export default { title: 'Guide', demos: { Demo } };`,
  [`${docs}/demo.html`]: '<b>Demo</b>',
  'D:/a/workspace/docs/styles/demo.scss': 'b { color: red; }',
};

test('the sources of a demo on Windows are engine paths, which watch inputs accept', () => {
  const project = new Project({ useInMemoryFileSystem: true });
  const page = project.createSourceFile(`${docs}/ng-doc.page.ts`, texts[`${docs}/ng-doc.page.ts`]);
  // The recorder reads the demo's files in memory, under the path it records (`normalize`).
  const files = {
    read: (file: string) => {
      const text = texts[normalize(file)];
      if (text === undefined) throw new Error(`ENOENT: ${file}`);
      return text;
    },
  } as unknown as TrackedFiles;
  const configuration = {
    workspaceRoot: 'D:/a/workspace',
    inlineStyleLanguage: 'SCSS',
  } as GeneratorConfiguration;

  const semantics = guideSemantics(page, files, configuration, {} as JsDoc);

  const sources = semantics.demos.Demo.map((asset) => asset.source);
  expect(sources).toEqual([
    `${docs}/ng-doc.page.ts`,
    `${docs}/demo.html`,
    'D:/a/workspace/docs/styles/demo.scss',
  ]);
  // The content compiler records each asset it reads as a content dependency of its source.
  expect(
    projectWatchInputs(sources.map((path) => ({ kind: 'content', path, digest: 'digest' }))).files,
  ).toEqual([...sources].sort());
});
