import { mkdir, writeFile, cp, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const guideRoute = '/preview/docs/outer/inner/guide';
export const bodyMarker = 'File content body one';
export const bodyReplacement = 'File content body two';
export const headerMarker = 'API header prose one';
export const headerReplacement = 'API header prose two';

export async function put(root, file, content) {
  const target = path.join(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
  return target;
}

export async function prepareFragmentHost(root) {
  const providersFile = path.join(root, 'src/providers.ts');
  let providers = await readFile(providersFile, 'utf8');
  providers = providers.replace(
    'provideNgDocApp()',
    `provideNgDocApp({contentAnchorScrolling:true,contentScrollPositionRestoration:'enabled',...(typeof location !== 'undefined' && new URL(location.href).searchParams.has('native-anchor-disabled') ? {contentAnchorScrolling:false} : {})})`,
  );
  if (!providers.includes('contentScrollPositionRestoration:'))
    providers = providers.replace(
      'contentAnchorScrolling:true,',
      "contentAnchorScrolling:true,contentScrollPositionRestoration:'enabled',",
    );
  if (!providers.includes('withInMemoryScrolling')) {
    providers = providers
      .replace(
        'provideRouter,withEnabledBlockingInitialNavigation',
        'provideRouter,withEnabledBlockingInitialNavigation,withInMemoryScrolling',
      )
      .replace(
        'withEnabledBlockingInitialNavigation())',
        'withEnabledBlockingInitialNavigation(),withInMemoryScrolling({anchorScrolling:"enabled",scrollPositionRestoration:"enabled"}))',
      );
  }
  await writeFile(providersFile, providers);
  const mainFile = path.join(root, 'src/main.ts');
  let main = await readFile(mainFile, 'utf8');
  if (!main.includes('__nativeScrollEvents')) {
    main =
      "import {provideAppInitializer,inject} from '@angular/core'; import {Router,Scroll} from '@angular/router';\n" +
      main;
    main = main.replace(
      'providers:[...providers,',
      `providers:[...providers,provideAppInitializer(()=>{const router=inject(Router);router.events.subscribe(event=>{if(event instanceof Scroll){const state=globalThis as any;(state.__nativeScrollEvents??=[]).push({anchor:event.anchor,position:event.position,scrollY:window.scrollY,targetExists:!!document.getElementById(event.anchor ?? 'delayed-section')});}});}),`,
    );
    await writeFile(mainFile, main);
  }
  if (!main.includes('__nativeAnchorCalls')) {
    main = "import {ViewportScroller} from '@angular/common';\n" + main;
    main = main.replace(
      'const router=inject(Router);',
      `const viewport=inject(ViewportScroller); const originalAnchor=viewport.scrollToAnchor.bind(viewport); viewport.scrollToAnchor=(anchor,options)=>{const state=globalThis as any; const measure=()=>{const el=document.getElementById(anchor);return {scrollY:window.scrollY,top:el?.getBoundingClientRect().top??null,documentTop:el?el.getBoundingClientRect().top+window.scrollY:null,height:document.documentElement.scrollHeight,maxScroll:document.documentElement.scrollHeight-document.documentElement.clientHeight};};const before=measure();originalAnchor(anchor,options);(state.__nativeAnchorCalls??=[]).push({anchor,before,after:measure()});};const router=inject(Router);`,
    );
    await writeFile(mainFile, main);
  }
  if (!main.includes('__nativePositionCalls')) {
    main = main.replace(
      'const originalAnchor=',
      `const originalPosition=viewport.scrollToPosition.bind(viewport);viewport.scrollToPosition=(position,options)=>{const state=globalThis as any;const before={scrollY:window.scrollY,height:document.documentElement.scrollHeight,maxScroll:document.documentElement.scrollHeight-document.documentElement.clientHeight};originalPosition(position,options);(state.__nativePositionCalls??=[]).push({position,before,after:{scrollY:window.scrollY,height:document.documentElement.scrollHeight,maxScroll:document.documentElement.scrollHeight-document.documentElement.clientHeight}});};const originalAnchor=`,
    );
    await writeFile(mainFile, main);
  }
  if (!main.includes('__nativeWheelEvents')) {
    main = main.replace(
      'const router=inject(Router);',
      `window.addEventListener('wheel',event=>{const state=globalThis as any;(state.__nativeWheelEvents??=[]).push({trusted:event.isTrusted,deltaY:event.deltaY,scrollY:window.scrollY,maxScroll:document.documentElement.scrollHeight-document.documentElement.clientHeight});},{passive:true});const router=inject(Router);`,
    );
    await writeFile(mainFile, main);
  }
  if (!main.includes('overflowAnchor:document.querySelector')) {
    main = main.replaceAll(
      'maxScroll:document.documentElement.scrollHeight-document.documentElement.clientHeight',
      `maxScroll:document.documentElement.scrollHeight-document.documentElement.clientHeight,overflowAnchor:document.querySelector('ng-doc-page-wrapper')?.getAttribute('style')??'',overflowAnchorValue:(document.querySelector('ng-doc-page-wrapper') as HTMLElement|null)?.style.getPropertyValue('overflow-anchor')??'',overflowAnchorPriority:(document.querySelector('ng-doc-page-wrapper') as HTMLElement|null)?.style.getPropertyPriority('overflow-anchor')??''`,
    );
    await writeFile(mainFile, main);
  }
  const markdown = path.join(root, 'docs/outer/inner/guide/guide.md.nunj');
  let body = await readFile(markdown, 'utf8');
  if (!body.includes('data-native-fragment-spacer')) {
    body = body.replace(
      '## Delayed section',
      '<div data-native-fragment-spacer aria-hidden="true" style="height:1600px"></div>\n\n## Delayed section',
    );
    await writeFile(markdown, body);
  }
  if (!body.includes('data-native-fragment-tail')) {
    body += '\n\n<div data-native-fragment-tail aria-hidden="true" style="height:1000px"></div>\n';
    await writeFile(markdown, body);
  }
}

export async function prepareFixture(root, repository) {
  await put(root, 'package.json', '{"private":true,"type":"module"}\n');
  await put(root, '.editorconfig', 'root = true\n');
  await put(
    root,
    'index.html',
    '<!doctype html><html><head><base href="/preview/"><link rel="icon" href="data:,"></head><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>',
  );
  const paths = {
    '@ng-doc/generated': ['./generated/index.ts'],
    '@ng-doc/generated/*': ['./generated/*'],
  };
  for (const library of ['app', 'core', 'ui-kit']) {
    paths[`@ng-doc/${library}`] = [path.join(repository, `dist/libs/${library}`)];
    paths[`@ng-doc/${library}/*`] = [path.join(repository, `dist/libs/${library}/*`)];
  }
  await put(
    root,
    'tsconfig.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          types: ['vite/client'],
          strict: true,
          experimentalDecorators: true,
          useDefineForClassFields: false,
          skipLibCheck: true,
          paths,
        },
        angularCompilerOptions: { strictTemplates: true },
        include: ['src/**/*.ts', 'docs/**/*.ts', 'generated/**/*.ts', 'server.ts'],
      },
      null,
      2,
    ),
  );
  await put(
    root,
    'ng-doc.config.mjs',
    "export default {docsPath:'docs',tsConfig:'tsconfig.json',routePrefix:'docs',cache:true};\n",
  );
  await put(
    root,
    'src/token.ts',
    "import {InjectionToken} from '@angular/core'; export const SCOPE = new InjectionToken<string>('native-scope');\n",
  );
  await put(
    root,
    'src/demo.ts',
    `import {Component,Input,inject} from '@angular/core'; import {SCOPE} from './token';
@Component({selector:'native-demo',standalone:true,template:'<button data-testid="counter" (click)="count=count+1">{{label}} {{count}}</button><span data-testid="scope">{{scope}}</span>',styles:['button {background:rgb(4,5,6)}']})
export class Demo { @Input() label='Demo'; @Input() count=2; readonly scope=inject(SCOPE); }
`,
  );
  await put(
    root,
    'src/api.ts',
    `/** Boundary API description.
 * @deprecated ${headerMarker}.
 */
export class BoundaryApi { /** Reads a value. */ read(value:string):string {return value;} }
`,
  );
  await put(
    root,
    'docs/outer/ng-doc.category.ts',
    "import {SCOPE} from '../../src/token'; const category={title:'Outer',route:'outer',providers:[{provide:SCOPE,useValue:'outer-provider'}]}; export default category;\n",
  );
  await put(
    root,
    'docs/outer/inner/ng-doc.category.ts',
    "import parent from '../ng-doc.category'; import {SCOPE} from '../../../src/token'; const category={title:'Inner',route:'inner',category:parent,providers:[{provide:SCOPE,useValue:'inner-provider'}]}; export default category;\n",
  );
  await put(
    root,
    'docs/outer/inner/guide/ng-doc.page.ts',
    `import category from '../ng-doc.category'; import {Demo} from '../../../../src/demo';
const page={title:'Content boundary ☃',route:'guide',category,mdFile:'./guide.md.nunj',demos:{Demo},playgrounds:{demo:{target:Demo,template:'<native-demo></native-demo>',inputs:{label:'Playground',count:4},defaults:{label:'Reset',count:1}}}}; export default page;
`,
  );
  await put(
    root,
    'docs/outer/inner/guide/guide.md.nunj',
    `---
keyword: BoundaryGuide
---
# Content boundary ☃

## Delayed section

${bodyMarker}.

[Local section](#delayed-section)

Navigate to \`*BoundaryOther\`.

{{ NgDocActions.demo("Demo", {expanded:true}) }}

{{ NgDocActions.playground("demo") }}

\`\`\`ts
const escaped = '\\x60 \${literal} ☃';
\`\`\`
`,
  );
  await put(
    root,
    'docs/outer/other/ng-doc.page.ts',
    "import category from '../ng-doc.category'; import {Demo} from '../../../src/demo'; const page={title:'Other page',route:'other',category,mdFile:'./other.md',demos:{Demo}}; export default page;\n",
  );
  await put(
    root,
    'docs/outer/other/other.md',
    '---\nkeyword: BoundaryOther\n---\n# Other page\n\n{{ NgDocActions.demo("Demo") }}\n',
  );
  await put(
    root,
    'docs/outer/inner/ng-doc.api.ts',
    "import category from './ng-doc.category'; const api={title:'Boundary reference',route:'reference',category,scopes:[{name:'Public',route:'public',include:['src/api.ts']}]}; export default api;\n",
  );
  await put(
    root,
    'docs/unopened/ng-doc.page.ts',
    "const page={title:'Unopened payload',route:'unopened',mdFile:'./unopened.md.nunj'}; export default page;\n",
  );
  await put(
    root,
    'docs/unopened/unopened.md.nunj',
    '# Unopened payload\n\n## Probe heading\n\nUnopened source payload marker.\n',
  );
  await put(
    root,
    'src/app.ts',
    `import {Component} from '@angular/core'; import {RouterOutlet} from '@angular/router'; import {NgDocRootComponent,NgDocSidebarComponent} from '@ng-doc/app';
@Component({selector:'app-root',standalone:true,imports:[RouterOutlet,NgDocRootComponent,NgDocSidebarComponent],template:'<ng-doc-root [sidebar]="true"><ng-doc-sidebar></ng-doc-sidebar><router-outlet></router-outlet></ng-doc-root>'}) export class App {}
`,
  );
  await put(
    root,
    'src/providers.ts',
    `import {provideHttpClient,withFetch} from '@angular/common/http'; import {provideRouter,withEnabledBlockingInitialNavigation} from '@angular/router';
import {provideNgDocApp,providePageSkeleton,NG_DOC_DEFAULT_PAGE_SKELETON,provideMainPageProcessor,NG_DOC_DEFAULT_PAGE_PROCESSORS} from '@ng-doc/app';
import {NG_DOC_ROUTING,provideNgDocContext} from '@ng-doc/generated';
export const providers=[provideHttpClient(withFetch()),provideNgDocApp(),provideNgDocContext(),providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),provideRouter([{path:'docs',children:NG_DOC_ROUTING}],withEnabledBlockingInitialNavigation())];
`,
  );
  await put(
    root,
    'src/main.ts',
    `import 'zone.js'; import ${JSON.stringify(path.join(repository, 'dist/libs/app/styles/global.css'))};
import {bootstrapApplication,provideClientHydration,withNoIncrementalHydration} from '@angular/platform-browser'; import {App} from './app'; import {providers} from './providers';
bootstrapApplication(App,{providers:[...providers,provideClientHydration(withNoIncrementalHydration())]}).then(()=>document.body.dataset.bootstrapped='yes');
`,
  );
  await cp(
    path.join(repository, 'dist/libs/ui-kit/assets'),
    path.join(root, 'public/assets/ng-doc/ui-kit'),
    { recursive: true },
  );
  await prepareFragmentHost(root);
}

export async function hostConfig(root, repository, observe) {
  const [{ createNgDocAngularPlugins: angular }, { createNgDocVitePlugin }] = await Promise.all([
    import(
      pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/angular/index.js')).href
    ),
    import(pathToFileURL(path.join(repository, 'dist/libs/builder/generator/vite/index.js')).href),
  ]);
  const prebundles = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit'])
    for (const file of await readdir(path.join(repository, `dist/libs/${library}/fesm2022`))) {
      if (!file.endsWith('.mjs')) continue;
      for (const match of (
        await readFile(path.join(repository, `dist/libs/${library}/fesm2022`, file), 'utf8')
      ).matchAll(/['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g))
        prebundles.add(match[1]);
    }
  return {
    root,
    configFile: false,
    base: '/preview/',
    logLevel: 'warn',
    cacheDir: path.join(root, 'cache/vite'),
    plugins: [
      ...(observe ? [observe] : []),
      createNgDocVitePlugin({
        analogLiveReload: true,
        angularPlugins: angular({
          liveReload: true,
          tsconfig: path.join(root, 'tsconfig.json'),
          workspaceRoot: root,
          disableTypeChecking: false,
          jit: false,
        }),
        angularComponentProbe: path.join(root, 'src/app.ts'),
        generator: {
          projectId: 'native-content',
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
      }),
    ],
    optimizeDeps: { include: [...prebundles] },
    ssr: { noExternal: true, optimizeDeps: { include: [...prebundles] } },
    resolve: {
      alias: ['app', 'core', 'ui-kit'].map((lib) => ({
        find: `@ng-doc/${lib}`,
        replacement: path.join(repository, `dist/libs/${lib}`),
      })),
      dedupe: [
        '@angular/core',
        '@angular/common',
        '@angular/compiler',
        '@angular/router',
        '@angular/platform-browser',
      ],
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root, repository] } },
  };
}
