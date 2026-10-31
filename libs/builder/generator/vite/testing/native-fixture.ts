/**
 * The real Vite/Analog host fixture of the native suites that need no page tabs
 * (`content-updates.vitest.ts`, `description-pass.vitest.ts`): one guide, its description module
 * and a probe component. Each suite starts its own servers; this module creates and removes the
 * workspaces.
 */
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const repository = path.resolve(import.meta.dirname, '../../../../..');
export const generatorDist = path.join(repository, 'dist/libs/builder/generator');
const temporary: string[] = [];

/** Removes every workspace this module created. */
export async function removeFixtures(): Promise<void> {
  await Promise.all(
    temporary
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })),
  );
}

export interface Fixture {
  root: string;
  docs: string;
  output: string;
  cache: string;
  config: string;
  tsconfig: string;
  markdown: string;
  app: string;
}

let saves = 0;

/** Writes `file` in one step, as an editor's atomic save does. */
export async function save(fixture: Fixture, file: string, text: string): Promise<void> {
  const folder = `${fixture.root}-saves`;
  if (!temporary.includes(folder)) temporary.push(folder);
  await mkdir(folder, { recursive: true });
  const staged = path.join(folder, String(++saves));
  await writeFile(staged, text);
  await rename(staged, file);
}

export async function project(): Promise<Fixture> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-native-'));
  temporary.push(root);
  const docs = path.join(root, 'docs');
  const output = path.join(root, 'generated');
  const cache = path.join(root, 'cache');
  const config = path.join(root, 'ng-doc.config.mjs');
  const tsconfig = path.join(root, 'tsconfig.json');
  const markdown = path.join(docs, 'guide.md');
  const app = path.join(root, 'src/app.component.ts');
  await mkdir(docs, { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await writeFile(path.join(root, '.editorconfig'), 'root = true\n');
  await writeFile(
    config,
    "export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: '', cache: true };\n",
  );
  await writeFile(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        experimentalDecorators: true,
        skipLibCheck: true,
        types: [],
        baseUrl: root,
        paths: {
          '@ng-doc/generated': [path.join(output, 'index.ts')],
          '@ng-doc/app': [path.join(repository, 'libs/app/index.ts')],
          '@ng-doc/app/*': [path.join(repository, 'libs/app/*')],
          '@ng-doc/core': [path.join(repository, 'libs/core/index.ts')],
          '@ng-doc/core/*': [path.join(repository, 'libs/core/*')],
          '@ng-doc/ui-kit': [path.join(repository, 'libs/ui-kit/index.ts')],
          '@ng-doc/ui-kit/*': [path.join(repository, 'libs/ui-kit/*')],
        },
      },
      angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true },
      include: ['docs/**/*.ts', 'src/**/*.ts', 'generated/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(docs, 'ng-doc.page.ts'),
    "const Guide = { title: 'Guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n",
  );
  await writeFile(markdown, '# Guide\nInitial body with searchable text.\n');
  await writeFile(
    app,
    "import { Component } from '@angular/core';\n@Component({ selector: 'fixture-app', template: 'app' })\nexport class AppComponent {}\n",
  );
  await writeFile(
    path.join(root, 'src/main.ts'),
    "import { NG_DOC_ROUTING } from '@ng-doc/generated';\ndocument.body.dataset.routes = String(NG_DOC_ROUTING.length);\n",
  );
  await writeFile(
    path.join(root, 'index.html'),
    '<html><head></head><body>fixture<script type="module" src="/src/main.ts"></script></body></html>',
  );
  return { root, docs, output, cache, config, tsconfig, markdown, app };
}

export function generatorOptions(fixture: Fixture, outputRoot: string, cacheRoot: string) {
  return {
    projectId: 'content-fixture',
    workspaceRoot: fixture.root,
    configFile: fixture.config,
    defaults: { docsRoot: fixture.docs, tsConfig: fixture.tsconfig, outputRoot, cacheRoot },
    templateRoot: path.join(generatorDist, 'templates'),
    worker: {
      moduleUrl: pathToFileURL(path.join(generatorDist, 'compiler/index.js')),
      workerEntryUrl: pathToFileURL(path.join(generatorDist, 'worker/entry.js')),
    },
  };
}

export function packageAliases() {
  // The package entry is the library's `index.ts`: Vite 8 resolves a directory through the
  // `exports` of its package.json, and `libs/app/package.json` exports only its style sheets.
  return ['app', 'core', 'ui-kit'].flatMap((name) => [
    {
      find: new RegExp(`^@ng-doc/${name}$`),
      replacement: path.join(repository, `libs/${name}/index.ts`),
    },
    {
      find: new RegExp(`^@ng-doc/${name}/`),
      replacement: `${path.join(repository, `libs/${name}`)}/`,
    },
  ]);
}

export function angularPackages(): string[] {
  return [
    '@angular/core',
    '@angular/common',
    '@angular/compiler',
    '@angular/platform-browser',
    '@angular/router',
    'rxjs',
  ];
}
