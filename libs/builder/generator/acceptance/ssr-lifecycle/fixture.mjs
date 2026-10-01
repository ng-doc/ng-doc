import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  bodyMarker,
  bodyReplacement,
  prepareFixture as prepareContentBoundaryFixture,
  put,
} from '../content-boundary/fixture.mjs';

// A physical-file (C) host: the generator writes real files under `generated/` and Vite serves them.
export const route = '/preview/docs/outer/inner/guide';
export const otherRoute = '/preview/docs/outer/other';
export const healthyMarker = bodyMarker;
export const healthyReplacement = bodyReplacement;
export const initialColor = 'rgb(11, 22, 33)';
export const changedColor = 'rgb(44, 55, 66)';

/** NGDOC_SSR_LIFECYCLE_GENERATOR selects a private generator build (build-generator.mjs --outdir). */
export function generatorRoot(repository) {
  return path.resolve(
    repository,
    process.env.NGDOC_SSR_LIFECYCLE_GENERATOR || 'dist/libs/builder/generator',
  );
}

export async function prepareFixture(root, repository) {
  await prepareContentBoundaryFixture(root, repository);
  await put(
    root,
    'ng-doc.config.mjs',
    "export default {docsPath:'docs',tsConfig:'tsconfig.json',routePrefix:'docs',cache:true};\n",
  );
  // Include targets outside the docs root; the worker adds a missing one and then repairs it.
  await mkdir(path.join(root, 'external'), { recursive: true });
  await put(
    root,
    'src/providers.ts',
    `import {provideHttpClient,withFetch} from '@angular/common/http';
import {Component} from '@angular/core';
import {provideRouter,withEnabledBlockingInitialNavigation} from '@angular/router';
import {NgDocDefaultSearchEngine,provideMainPageProcessor,provideNgDocApp,providePageSkeleton,provideSearchEngine,NG_DOC_DEFAULT_PAGE_PROCESSORS,NG_DOC_DEFAULT_PAGE_SKELETON} from '@ng-doc/app';
import {NG_DOC_ROUTING,provideNgDocContext} from '@ng-doc/generated';
@Component({selector:'native-idle',standalone:true,template:'<p data-testid="idle">Idle host</p>'}) export class Idle {}
export const providers=[provideHttpClient(withFetch()),provideNgDocApp(),provideNgDocContext(),providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),provideSearchEngine(NgDocDefaultSearchEngine),provideRouter([{path:'idle',component:Idle},{path:'docs',children:NG_DOC_ROUTING}],withEnabledBlockingInitialNavigation())];
`,
  );
  await put(
    root,
    'src/app.ts',
    `import {Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {NgDocRootComponent} from '@ng-doc/app';
@Component({selector:'app-root',standalone:true,imports:[RouterOutlet,NgDocRootComponent],template:'<ng-doc-root><router-outlet/></ng-doc-root>'})
export class App {}
`,
  );
  await put(
    root,
    'src/main.server.ts',
    `import 'zone.js/node';
import {enableProdMode} from '@angular/core';
import {bootstrapApplication,BootstrapContext,provideClientHydration,withNoIncrementalHydration} from '@angular/platform-browser';
import {renderApplication,provideServerRendering} from '@angular/platform-server';
import {withNgDocContentReady} from '@ng-doc/app/helpers';
import {App} from './app'; import {providers} from './providers';
enableProdMode();
const document='<!doctype html><html><head><base href="/preview/"></head><body><app-root></app-root></body></html>';
export const renderRoute=(url:string)=>renderApplication(withNgDocContentReady((context:BootstrapContext)=>bootstrapApplication(App,{providers:[...providers,provideServerRendering(),provideClientHydration(withNoIncrementalHydration())]},context)),{document,url,allowedHosts:['localhost','127.0.0.1']});
`,
  );
  await put(root, 'server.ts', "export {renderRoute} from './src/main.server';\n");
  const demo = path.join(root, 'src/demo.ts');
  await writeFile(
    demo,
    (await readFile(demo, 'utf8'))
      .replace(",styles:['button {background:rgb(4,5,6)}']", ",styleUrl:'./demo.scss'")
      .replace(
        "template:'<button",
        'template:\'<output data-testid="ts-marker">TS_ONE</output><button',
      ),
  );
  await writeFile(path.join(root, 'src/_theme.scss'), `$color:${initialColor};\n`);
  await writeFile(
    path.join(root, 'src/demo.scss'),
    "@use 'probe-colors' as theme; output[data-testid='ts-marker'] { background-color: theme.$color; }\n",
  );
  await writeFile(
    path.join(root, 'src/ssr-render.ts'),
    `import 'zone.js/node';
import {enableProdMode} from '@angular/core';
import {bootstrapApplication,BootstrapContext,provideClientHydration,withNoIncrementalHydration} from '@angular/platform-browser';
import {renderApplication,provideServerRendering} from '@angular/platform-server';
import {withNgDocContentReady} from '@ng-doc/app/helpers';
import {App} from './app'; import {providers} from './providers';
enableProdMode();
export async function render(request:{document:string;url:string;data?:unknown},{signal}:{signal:AbortSignal}){
  const data=request.data as {gateUrl?:string}|undefined;
  if(data?.gateUrl){
    const admitted=await fetch(data.gateUrl+'/admit',{method:'POST',signal});
    if(!admitted.ok)throw new Error('SSR acceptance gate admission failed');
    const released=await fetch(data.gateUrl+'/wait',{signal});
    if(!released.ok)throw new Error('SSR acceptance gate release failed');
  }
  signal.throwIfAborted();
  return renderApplication(withNgDocContentReady((context:BootstrapContext)=>bootstrapApplication(App,{providers:[...providers,provideServerRendering(),provideClientHydration(withNoIncrementalHydration())]},context)),{document:request.document,url:request.url,allowedHosts:['localhost','127.0.0.1']});
}
`,
  );
}

export async function host(root, repository, observer, customLogger, entry = '/src/ssr-render.ts') {
  const generator = generatorRoot(repository);
  const [{ createNgDocAngularPlugins }, { createNgDocVitePlugin, getNgDocViteSsrRenderer }] =
    await Promise.all([
      import(pathToFileURL(path.join(generator, 'vite/angular/index.js')).href),
      import(pathToFileURL(path.join(generator, 'vite/index.js')).href),
    ]);
  const prebundles = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit']) {
    for (const file of await readdir(path.join(repository, `dist/libs/${library}/fesm2022`))) {
      if (!file.endsWith('.mjs')) continue;
      for (const match of (
        await readFile(path.join(repository, `dist/libs/${library}/fesm2022`, file), 'utf8')
      ).matchAll(/['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g))
        prebundles.add(match[1]);
    }
  }
  const ngDocPlugins = createNgDocVitePlugin({
    analogLiveReload: true,
    angularPlugins: createNgDocAngularPlugins({
      liveReload: true,
      tsconfig: path.join(root, 'tsconfig.json'),
      workspaceRoot: root,
      disableTypeChecking: false,
      jit: false,
    }),
    angularComponentProbe: path.join(root, 'src/app.ts'),
    generator: {
      projectId: 'native-ssr-lifecycle',
      workspaceRoot: root,
      configFile: path.join(root, 'ng-doc.config.mjs'),
      defaults: {
        docsRoot: path.join(root, 'docs'),
        tsConfig: path.join(root, 'tsconfig.json'),
        outputRoot: path.join(root, 'generated'),
        cacheRoot: path.join(root, 'cache/generator'),
      },
      session: { batchDelayMs: 5 },
    },
  });
  const config = {
    root,
    configFile: false,
    base: '/preview/',
    logLevel: 'warn',
    cacheDir: path.join(root, 'cache/vite'),
    ...(customLogger ? { customLogger } : {}),
    plugins: [...(observer ? [observer] : []), ...ngDocPlugins],
    optimizeDeps: { include: [...prebundles] },
    ssr: {
      // The HMR-enabled development runner must transform partial Angular packages, while
      // Node owns ordinary CommonJS dependencies such as RxJS.
      noExternal: [
        /^@ng-doc\//,
        /^@angular\//,
        /^@ng-web-apis\//,
        /^@taiga-ui\//,
        /^di-controls(?:\/|$)/,
      ],
      optimizeDeps: { include: [...prebundles] },
    },
    resolve: {
      alias: [
        ...['app', 'core', 'ui-kit'].map((library) => ({
          find: `@ng-doc/${library}`,
          replacement: path.join(repository, `dist/libs/${library}`),
        })),
        { find: 'probe-colors', replacement: path.join(root, 'src/_theme.scss') },
      ],
      dedupe: [
        '@angular/core',
        '@angular/common',
        '@angular/compiler',
        '@angular/router',
        '@angular/platform-browser',
      ],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root, repository] } },
    build: { commonjsOptions: { include: [/node_modules/, /dist\/libs\/core\//] } },
  };
  // `entry: null` selects no isolated renderer (legacy-worker.mjs uses Vite's own in-process SSR import).
  return {
    config,
    renderer: entry === null ? undefined : getNgDocViteSsrRenderer(ngDocPlugins, { entry }),
  };
}
