import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, '../../../../..');
const evidence = path.join(root, 'docs/architecture/evidence/t12/production/theme-isolation');
await mkdir(path.join(directory, '.runtime'), { recursive: true });
await mkdir(evidence, { recursive: true });
const temporary = await mkdtemp(path.join(directory, '.runtime/shiki-ssr-'));
const service = path.join(root, 'libs/app/services/highlighter/highlighter.service.ts');
const summary = {
  node: process.version,
  boundary:
    'Real Angular renderApplication/bootstrapApplication and real Shiki; service bundled from source, public Angular/NgDoc tokens resolved from workspace packages',
  serviceSha256: createHash('sha256')
    .update(await readFile(service))
    .digest('hex'),
  renders: [],
};
try {
  const filename = path.join(temporary, 'ssr.mjs');
  await build({
    stdin: {
      contents: `
import '@angular/compiler';
import { Component, inject, provideAppInitializer } from '@angular/core';
import { bootstrapApplication, DomSanitizer } from '@angular/platform-browser';
import { renderApplication, provideServerRendering } from '@angular/platform-server';
import { NG_DOC_SHIKI_THEME } from '@ng-doc/app/tokens';
import { NgDocHighlighterService } from ${JSON.stringify(service)};
class Root {
  html = inject(DomSanitizer).bypassSecurityTrustHtml(inject(NgDocHighlighterService).highlight('<b>Repeated SSR</b>'));
}
Component({selector:'app-root', standalone:true, template:'<main [innerHTML]="html"></main>'})(Root);
export async function render(themeName, foreground, form = 'direct') {
  const theme = {name:themeName, type:'light', colors:{'editor.background':'#ffffff','editor.foreground':foreground}, tokenColors:[]};
  const themes = form === 'getter' ? [() => Promise.resolve(theme)] : form === 'promise' ? [Promise.resolve({default: theme})] : [theme];
  return renderApplication(context => bootstrapApplication(Root, { providers: [
    provideServerRendering(), NgDocHighlighterService,
    {provide: NG_DOC_SHIKI_THEME, useValue: {light:themeName || '', dark:themeName || ''}},
    provideAppInitializer(() => inject(NgDocHighlighterService).initialize(themeName ? { themes } : undefined))
  ]}, context), {document:'<!doctype html><html><head></head><body><app-root></app-root></body></html>', url:'https://ngdoc.test/', allowedHosts:['ngdoc.test']});
}
`,
      resolveDir: root,
      sourcefile: 't12-shiki-ssr.ts',
      loader: 'ts',
    },
    absWorkingDir: root,
    tsconfig: path.join(root, 'tsconfig.base.json'),
    outfile: filename,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
  const { render } = await import(pathToFileURL(filename).href);
  async function checked(name, foreground, form) {
    const html = await render(name, foreground, form);
    assert.ok(html.includes(name || 'github-light'), `SSR omitted theme ${name}`);
    if (foreground)
      assert.ok(html.toLowerCase().includes(foreground), `SSR used stale colors for ${name}`);
    assert.ok(html.includes('Repeated SSR'));
    summary.renders.push({
      name: name || 'default',
      foreground,
      form: form || 'direct',
      bytes: Buffer.byteLength(html),
    });
  }
  await checked(undefined, undefined);
  for (const [name, foreground, form] of [
    ['t12-first', '#123456'],
    ['t12-second', '#654321'],
    ['t12-first', '#abcdef'],
    ['t12-getter', '#345678', 'getter'],
    ['t12-promise', '#876543', 'promise'],
  ])
    await checked(name, foreground, form);
  await Promise.all([
    checked('t12-concurrent', '#aabbcc', 'getter'),
    checked('t12-concurrent', '#ccbbaa', 'promise'),
  ]);
  await checked(undefined, undefined);
  summary.passed = true;
} catch (error) {
  summary.failure = String(error.stack || error);
  process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
  await writeFile(path.join(evidence, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
}
