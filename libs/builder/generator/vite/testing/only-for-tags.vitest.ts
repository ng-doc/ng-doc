import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type Plugin, type ViteDevServer, build as viteBuild, createServer } from 'vite';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import {
  type SourceCompilerBundle,
  bundleSourceCompiler,
} from '../../compiler/testing/source-bundle';
import { createNgDocVitePlugin } from '..';
import { qualifyAngularPlugins } from '../angular-compatibility';
import { generatorWithTags } from '../options';

const repository = path.resolve(import.meta.dirname, '../../../../..');
const temporary: string[] = [];
const servers: ViteDevServer[] = [];
let sourceBundle: Promise<SourceCompilerBundle> | undefined;

afterEach(async () => {
  await Promise.allSettled(servers.splice(0).map((server) => server.close()));
  await Promise.all(temporary.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

afterAll(async () => {
  await (await sourceBundle)?.dispose();
});

interface Fixture {
  root: string;
  docs: string;
  output: string;
  app: string;
}

/** A page for everyone and a `Develop` page with `onlyForTags: ['development']`. */
async function project(): Promise<Fixture> {
  const runtime = path.join(import.meta.dirname, '.runtime');
  await mkdir(runtime, { recursive: true });
  const root = await mkdtemp(path.join(runtime, 'ng-doc-tags-'));
  temporary.push(root);
  const docs = path.join(root, 'docs');
  const output = path.join(root, 'generated');
  const app = path.join(root, 'src/app.component.ts');
  await symlink(path.join(repository, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  await mkdir(path.join(docs, 'public'), { recursive: true });
  await mkdir(path.join(docs, 'develop'), { recursive: true });
  await mkdir(path.join(root, 'src'), { recursive: true });
  await writeFile(
    path.join(root, 'ng-doc.config.mjs'),
    `export default { docsPath: 'docs', tsConfig: 'tsconfig.json', routePrefix: 'docs', cache: true };\n`,
  );
  await writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        skipLibCheck: true,
        types: [],
        paths: { '@ng-doc/generated': [path.join(output, 'index.ts')] },
      },
      include: ['docs/**/*.ts', 'src/**/*.ts'],
    }),
  );
  await writeFile(
    path.join(docs, 'public/ng-doc.page.ts'),
    `const Public = { title: 'Public', mdFile: './index.md' };\nexport default Public;\n`,
  );
  await writeFile(path.join(docs, 'public/index.md'), '# Public\nEveryone sees this page.\n');
  await writeFile(
    path.join(docs, 'develop/ng-doc.page.ts'),
    `const Develop = { title: 'Develop', mdFile: './index.md', onlyForTags: ['development'] };\nexport default Develop;\n`,
  );
  await writeFile(path.join(docs, 'develop/index.md'), '# Develop\nInternal sandbox marker.\n');
  await writeFile(app, `export class AppComponent {}\n`);
  await writeFile(path.join(root, 'src/main.ts'), `document.body.dataset.ready = 'yes';\n`);
  await writeFile(
    path.join(root, 'index.html'),
    '<html><head></head><body>fixture<script type="module" src="/src/main.ts"></script></body></html>',
  );
  return { root, docs, output, app };
}

async function plugin(fixture: Fixture, tags?: string[]): Promise<Plugin[]> {
  const compiler = await (sourceBundle ??= bundleSourceCompiler());
  // The fake Analog pair of the adapter tests: compiles only the component probe.
  const angular: Plugin[] = [
    {
      name: '@analogjs/vite-plugin-angular',
      buildStart() {},
      handleHotUpdate: (context) => context.modules,
      transform: {
        filter: { id: /\.ts$/ },
        handler(_code: string, id: string) {
          if (path.resolve(id.replace(/\?.*$/, '')) !== path.resolve(fixture.app)) return;
          return { code: 'export class AppComponent {}; AppComponent.ɵcmp = {};', map: null };
        },
      },
    },
    { name: 'fake-angular-companion' },
  ];
  return createNgDocVitePlugin({
    analogLiveReload: true,
    angularPlugins: qualifyAngularPlugins(angular),
    angularComponentProbe: fixture.app,
    generator: {
      projectId: 'tags-fixture',
      workspaceRoot: fixture.root,
      configFile: path.join(fixture.root, 'ng-doc.config.mjs'),
      defaults: {
        docsRoot: fixture.docs,
        tsConfig: path.join(fixture.root, 'tsconfig.json'),
        outputRoot: fixture.output,
        cacheRoot: path.join(fixture.root, 'cache'),
      },
      ...(tags ? { discovery: { tags } } : {}),
      templateRoot: compiler.templateRoot,
      worker: { moduleUrl: compiler.moduleUrl, workerEntryUrl: compiler.workerEntryUrl },
      session: { batchDelayMs: 5 },
    },
  });
}

/** The routes and search records the generation published. */
async function published(fixture: Fixture): Promise<{ routes: string; search: string }> {
  return {
    routes: await readFile(path.join(fixture.output, 'routes.ts'), 'utf8'),
    search: await readFile(path.join(fixture.output, 'assets/indexes.json'), 'utf8'),
  };
}

async function production(fixture: Fixture, tags?: string[], mode?: string): Promise<string> {
  const bundle = path.join(fixture.root, 'bundle');
  await viteBuild({
    root: fixture.root,
    configFile: false,
    logLevel: 'silent',
    ...(mode ? { mode } : {}),
    plugins: [await plugin(fixture, tags)],
    build: { outDir: bundle, emptyOutDir: true },
  });
  return bundle;
}

describe('onlyForTags with the Vite host', () => {
  it('leaves a development-only page out of a production build and keeps it in dev serve', async () => {
    const fixture = await project();
    const bundle = await production(fixture);
    const built = await published(fixture);
    expect(built.routes).toContain("path: 'public'");
    expect(built.routes).not.toContain("path: 'develop'");
    expect(built.search).toContain('Everyone sees this page');
    expect(built.search).not.toContain('Internal sandbox marker');
    const emitted = await readFile(path.join(bundle, 'assets/ng-doc/indexes.json'), 'utf8');
    expect(emitted).not.toContain('Internal sandbox marker');
    expect(existsSync(path.join(fixture.output, 'guides'))).toBe(true);

    const server = await createServer({
      root: fixture.root,
      // Its own dependency cache (below a node_modules folder, as linters and editors skip): the
      // default one is shared by every fixture.
      cacheDir: path.join(fixture.root, '.vite/node_modules/.vite'),
      configFile: false,
      logLevel: 'silent',
      plugins: [await plugin(fixture)],
      server: { host: '127.0.0.1', port: 0 },
    });
    servers.push(server);
    const served = await published(fixture);
    expect(served.routes).toContain("path: 'public'");
    expect(served.routes).toContain("path: 'develop'");
    expect(served.search).toContain('Internal sandbox marker');
  }, 120_000);

  it('uses explicit generator tags and a custom Vite mode as the tag', async () => {
    const fixture = await project();
    await production(fixture, ['development']);
    expect((await published(fixture)).routes).toContain("path: 'develop'");
    await production(fixture, undefined, 'development');
    expect((await published(fixture)).routes).toContain("path: 'develop'");
    await production(fixture, undefined, 'staging');
    expect((await published(fixture)).routes).not.toContain("path: 'develop'");
  }, 120_000);

  it('defaults the tags to the Vite mode only when the generator sets none', () => {
    const generator = {
      projectId: 'p',
      workspaceRoot: '/w',
      defaults: { docsRoot: '/w/d', tsConfig: '/w/t', outputRoot: '/w/o', cacheRoot: '/w/c' },
      discovery: { inlineStyleLanguage: 'SCSS' as const },
    };
    expect(generatorWithTags(generator, 'production').discovery).toEqual({
      inlineStyleLanguage: 'SCSS',
      tags: ['production'],
    });
    expect(generator.discovery).toEqual({ inlineStyleLanguage: 'SCSS' });
    const explicit = { ...generator, discovery: { tags: [] } };
    expect(generatorWithTags(explicit, 'development')).toBe(explicit);
    expect(generatorWithTags({ ...generator, discovery: undefined }, 'staging').discovery).toEqual({
      tags: ['staging'],
    });
  });
});
