import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const workspace = path.resolve(root, '../../..');
const upstream = path.join(workspace, 'node_modules/@analogjs/vite-plugin-angular');
const source = path.join(upstream, 'src');
const output = path.join(root, 'package');
const upstreamPackage = JSON.parse(await readFile(path.join(upstream, 'package.json'), 'utf8'));
const sourcePath = path.join(source, 'lib/angular-vite-plugin.js');
const expected = {
  name: '@analogjs/vite-plugin-angular',
  version: '2.6.3',
  sourceSha256: 'cec7abb4b1063d6dbf59298e897a8322077d8d57eeddbe81829a91588ca69826',
  sourceInventorySha256: '86be448127bc03f7b4635dc77dd924a8fdefb6839eb3e7aa63d76b206a36eb84',
};
const sourceText = await readFile(sourcePath, 'utf8');
const actualHash = createHash('sha256').update(sourceText).digest('hex');
if (upstreamPackage.name !== expected.name || upstreamPackage.version !== expected.version) {
  throw new Error(`Pinned upstream mismatch: ${upstreamPackage.name}@${upstreamPackage.version}`);
}
if (actualHash !== expected.sourceSha256) {
  throw new Error(`Pinned source hash mismatch: ${actualHash}`);
}
async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const value = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(value)));
    else if (entry.isFile()) files.push(value);
  }
  return files;
}
const inputFiles = await sourceFiles(source);
const inventory = (
  await Promise.all(
    inputFiles.map(async (file) => {
      const digest = createHash('sha256')
        .update(await readFile(file))
        .digest('hex');
      return `${digest}  ${path.relative(source, file).split(path.sep).join('/')}`;
    }),
  )
).join('\n');
const inventoryHash = createHash('sha256').update(`${inventory}\n`).digest('hex');
if (inventoryHash !== expected.sourceInventorySha256) {
  throw new Error(`Pinned source inventory hash mismatch: ${inventoryHash}`);
}

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'vendor'), { recursive: true });
await cp(source, path.join(output, 'vendor/src'), { recursive: true });

const copiedSourcePath = path.join(output, 'vendor/src/lib/angular-vite-plugin.js');
const copiedSource = await readFile(copiedSourcePath, 'utf8');
const original = `pendingCompilation = performCompilation(resolvedConfig, [\n                        ...mods.map((mod) => mod.id),\n                        ...updates,\n                    ]);`;
const patched = `pendingCompilation = performCompilation(resolvedConfig, [\n                        ctx.file,\n                        ...mods.map((mod) => mod.id),\n                        ...updates,\n                    ]);`;
const patchParts = copiedSource.split(original);
if (patchParts.length !== 2 || copiedSource.includes(patched)) {
  throw new Error('Expected exact ctx.file patch anchor was not found exactly once.');
}
await writeFile(copiedSourcePath, `${patchParts[0]}${patched}${patchParts[1]}`);

const shim = path.join(output, 'vendor/ts-morph-upstream.mjs');
await writeFile(
  shim,
  `import { createRequire } from 'node:module';\n` +
    `const upstreamRequire = createRequire(import.meta.resolve('@analogjs/vite-plugin-angular/package.json'));\n` +
    `const upstreamTsMorph = upstreamRequire('ts-morph');\n` +
    `export const Project = upstreamTsMorph.Project;\n` +
    `export const SyntaxKind = upstreamTsMorph.SyntaxKind;\n`,
);
const entry = path.join(output, 'entry.mjs');
await writeFile(
  entry,
  `import upstreamAngular from './vendor/src/index.js';\n` +
    `export function createNgDocAngularCompatibilityPlugins(options) {\n` +
    `  return upstreamAngular(options);\n` +
    `}\n` +
    `export default createNgDocAngularCompatibilityPlugins;\n`,
);

const bare = new Set();
const result = await build({
  entryPoints: [entry],
  outfile: path.join(output, 'dist/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  sourcemap: true,
  metafile: true,
  plugins: [
    {
      name: 'upstream-ts-morph-context',
      setup(buildApi) {
        buildApi.onResolve({ filter: /^ts-morph$/ }, () => ({ path: shim }));
        buildApi.onResolve({ filter: /^[^./]|^@[^^/]+\// }, (args) => {
          if (args.path.startsWith('node:')) return { path: args.path, external: true };
          bare.add(args.path);
          return { path: args.path, external: true };
        });
      },
    },
  ],
});

const packageJson = {
  name: '@ng-doc/analog-compat-prototype',
  version: '0.0.0-prototype',
  type: 'module',
  exports: {
    '.': { types: './dist/index.d.ts', import: './dist/index.js', default: './dist/index.js' },
  },
  files: ['dist', 'UPSTREAM-PROVENANCE.md', 'UPSTREAM-INPUT-INVENTORY.sha256', 'LICENSE'],
  dependencies: {
    '@analogjs/vite-plugin-angular': '2.6.3',
    'magic-string': '0.30.21',
    obug: '2.2.1',
    'oxc-parser': '0.121.0',
    tinyglobby: '0.2.16',
  },
  peerDependencies: {
    '@angular-devkit/build-angular': '22.0.6',
    '@angular/build': '22.0.6',
    '@angular/compiler': '22.0.6',
    '@angular/compiler-cli': '22.0.6',
    '@angular/core': '22.0.6',
    typescript: '6.0.3',
    vite: '7.3.5',
  },
};
await writeFile(path.join(output, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
await writeFile(
  path.join(output, 'dist/index.d.ts'),
  `import type { Plugin } from 'vite';\n` +
    `import type { PluginOptions } from '@analogjs/vite-plugin-angular';\n` +
    `export declare function createNgDocAngularCompatibilityPlugins(options?: PluginOptions): Plugin[];\n` +
    `export default createNgDocAngularCompatibilityPlugins;\n`,
);
await writeFile(
  path.join(output, 'UPSTREAM-PROVENANCE.md'),
  `# Upstream provenance\n\n` +
    `Source: ${expected.name}@${expected.version}\n` +
    `Tag: https://github.com/analogjs/analog/tree/v${expected.version}\n\n` +
    `License: https://raw.githubusercontent.com/analogjs/analog/v${expected.version}/LICENSE\n\n` +
    `Original src/lib/angular-vite-plugin.js SHA-256: ${expected.sourceSha256}\n\n` +
    `Full src inventory SHA-256 (${inputFiles.length} files): ${expected.sourceInventorySha256}\n\n` +
    `License declared by upstream package metadata: ${upstreamPackage.license}.\n\n` +
    `Applied patch: add ctx.file as the first input to the resource-branch performCompilation call.\n` +
    `No other source edit is applied by this prototype.\n`,
);
await writeFile(path.join(output, 'UPSTREAM-INPUT-INVENTORY.sha256'), `${inventory}\n`);
await writeFile(
  path.join(output, 'LICENSE'),
  `The MIT License (MIT)\n\n` +
    `Copyright (c) 2022 Brandon Roberts\n\n` +
    `Permission is hereby granted, free of charge, to any person obtaining a copy\n` +
    `of this software and associated documentation files (the \"Software\"), to deal\n` +
    `in the Software without restriction, including without limitation the rights\n` +
    `to use, copy, modify, merge, publish, distribute, sublicense, and/or sell\n` +
    `copies of the Software, and to permit persons to whom the Software is\n` +
    `furnished to do so, subject to the following conditions:\n\n` +
    `The above copyright notice and this permission notice shall be included in all\n` +
    `copies or substantial portions of the Software.\n\n` +
    `THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\n` +
    `IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\n` +
    `FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\n` +
    `AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\n` +
    `LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\n` +
    `OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\n` +
    `SOFTWARE.\n`,
);
await writeFile(
  path.join(output, 'metafile.json'),
  `${JSON.stringify(
    {
      bareImports: [...bare].sort(),
      runtimeCreateRequire: [
        {
          id: 'typescript',
          owner: 'candidate peer typescript@6.0.3',
          note: 'Bundling rebases upstream createRequire(import.meta.url) to this ESM package.',
        },
        {
          id: '@angular/build/private',
          owner: 'candidate peer @angular/build@22.0.6',
          note: 'Pinned Angular 22 branch; private upstream compatibility surface retained, not invented.',
        },
        {
          id: '@angular-devkit/build-angular/src/tools/esbuild/angular/*',
          owner: 'candidate peer @angular-devkit/build-angular@22.0.6',
          note: 'Legacy upstream branch retained in the bundled source; not exercised by the Angular 22 probe.',
        },
      ],
      metafile: result.metafile,
    },
    null,
    2,
  )}\n`,
);
