import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const INVALID_CONTENT_MARKER = 'T19_INVALID_TEMPLATE_MARKER';
const GUIDE_SIZES = new Set([100, 500, 1000]);

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const apiIdentity = (index) => {
  const id = String(index).padStart(4, '0');
  return index % 4 === 0
    ? `BenchmarkApi${id}`
    : index % 4 === 1
      ? `BenchmarkContract${id}`
      : index % 4 === 2
        ? `benchmarkFunction${id}`
        : `BenchmarkAlias${id}`;
};

function checkOptions(options = {}) {
  const { guides, apiDeclarations = 0, seed = 't19-fixture-v1' } = options;
  if (!Number.isInteger(guides) || !GUIDE_SIZES.has(guides))
    throw new RangeError('guides must be one of 100, 500, or 1000');
  if (!Number.isInteger(apiDeclarations) || apiDeclarations < 0 || apiDeclarations > 1000)
    throw new RangeError('apiDeclarations must be an integer from 0 through 1000');
  if (typeof seed !== 'string' || !/^[A-Za-z0-9._-]+$/.test(seed))
    throw new TypeError('seed must contain only letters, digits, dot, underscore, or dash');
  return { guides, apiDeclarations, seed };
}

function guideSource(index, guides, includeShared) {
  const id = String(index).padStart(4, '0');
  const category = String(((index - 1) % Math.max(1, Math.ceil(guides / 10))) + 1).padStart(2, '0');
  const related = (index % guides) + 1;
  const relatedCategory = String(
    ((related - 1) % Math.max(1, Math.ceil(guides / 10))) + 1,
  ).padStart(2, '0');
  return {
    category,
    route: `guide-${id}`,
    title: `Benchmark guide ${index}`,
    body: `# Benchmark guide ${index}\n\nThis deterministic body belongs to guide ${index}.\n\n${includeShared ? '{% include "../../../shared/header.nunj" %}\n\n' : ''}<div class="benchmark-demo demo-${id}">Demo ${index}</div>\n\n{{ NgDocActions.demo("BenchmarkDemo") }}\n\n\`\`\`ts name="Example ${id}" icon="code"\nexport const example${id} = 'guide-${id}';\n\`\`\`\n\n[Related guide](/preview/docs/category-${relatedCategory}/section-${relatedCategory}/guide-${String(related).padStart(4, '0')}/)\n`,
  };
}

function apiSource(index) {
  const id = String(index).padStart(4, '0');
  switch (index % 4) {
    case 0:
      return `/** Benchmark class ${index}. */\nexport class BenchmarkApi${id}${index % 8 === 0 && (index - 1) % 50 >= 4 ? ` extends BenchmarkApi${String(index - 4).padStart(4, '0')}` : ''} { value${id} = ${index}; read${id}(input: string): string { return input + '-${id}'; } }\n`;
    case 1:
      return `/** Benchmark interface ${index}. */\nexport interface BenchmarkContract${id} { value: string; }\n`;
    case 2:
      return `/** Benchmark function ${index}. */\nexport function benchmarkFunction${id}(value: string): string { return value; }\n`;
    default:
      return `/** Benchmark alias ${index}. */\nexport type BenchmarkAlias${id} = { value: string; };\n`;
  }
}

async function put(root, relative, content, files) {
  const target = path.join(root, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content, 'utf8');
  files.push({
    path: relative.replaceAll(path.sep, '/'),
    sha256: sha256(content),
    bytes: Buffer.byteLength(content),
  });
  return target;
}

/**
 * Write one deterministic, file-backed Angular/NgDoc benchmark fixture.
 * The generated workspace contains no machine-specific absolute paths.
 */
export async function writeFixture(root, options = {}) {
  const { guides, apiDeclarations, seed } = checkOptions(options);
  const files = [];
  const categories = Math.max(1, Math.ceil(guides / 10));
  const sharedConsumers = Array.from({ length: Math.ceil(guides / 5) }, (_, i) => i * 5 + 1);

  await put(
    root,
    'package.json',
    json({ name: `t19-fixture-${guides}`, private: true, type: 'module' }),
    files,
  );
  await put(root, '.editorconfig', 'root = true\n', files);
  await put(
    root,
    'index.html',
    '<!doctype html><html><head><base href="/preview/"><link rel="icon" href="data:,"></head><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>\n',
    files,
  );
  await put(
    root,
    'ng-doc.config.mjs',
    "export default {docsPath:'docs',tsConfig:'tsconfig.json',routePrefix:'docs',cache:true};\n",
    files,
  );
  await put(
    root,
    'tsconfig.json',
    json({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        experimentalDecorators: true,
        useDefineForClassFields: false,
        skipLibCheck: true,
      },
      angularCompilerOptions: { strictTemplates: true },
      include: ['src/**/*.ts', 'docs/**/*.ts', 'generated/**/*.ts'],
    }),
    files,
  );
  await put(
    root,
    'src/app.ts',
    `import {Component} from '@angular/core';\nimport {RouterOutlet} from '@angular/router';\nimport {NgDocRootComponent,NgDocSearchComponent} from '@ng-doc/app';\n@Component({selector:'app-root',standalone:true,imports:[RouterOutlet,NgDocRootComponent,NgDocSearchComponent],template:'<ng-doc-root><ng-doc-search/><router-outlet/></ng-doc-root>'})\nexport class App {}\n`,
    files,
  );
  await put(
    root,
    'src/providers.ts',
    `import {provideHttpClient,withFetch} from '@angular/common/http'; import {provideRouter,withEnabledBlockingInitialNavigation} from '@angular/router';\nimport {NgDocDefaultSearchEngine,provideSearchEngine,provideNgDocApp,providePageSkeleton,NG_DOC_DEFAULT_PAGE_SKELETON,provideMainPageProcessor,NG_DOC_DEFAULT_PAGE_PROCESSORS} from '@ng-doc/app';\nimport {NG_DOC_ROUTING,provideNgDocContext} from '@ng-doc/generated';\nexport const providers=[provideHttpClient(withFetch()),provideNgDocApp(),provideNgDocContext(),providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS),provideSearchEngine(NgDocDefaultSearchEngine),provideRouter([{path:'docs',children:NG_DOC_ROUTING}],withEnabledBlockingInitialNavigation())];\n`,
    files,
  );
  await put(
    root,
    'src/main.ts',
    `import 'zone.js'; import '@ng-doc/app/styles/global.css'; import {bootstrapApplication,provideClientHydration,withNoIncrementalHydration} from '@angular/platform-browser'; import {App} from './app'; import {providers} from './providers'; bootstrapApplication(App,{providers:[...providers,provideClientHydration(withNoIncrementalHydration())]}).then(()=>document.body.dataset['bootstrapped']='true').catch((error)=>document.body.dataset['bootstrapError']=String(error));\n`,
    files,
  );
  await put(
    root,
    'src/main.server.ts',
    `import 'zone.js/node'; import {bootstrapApplication,BootstrapContext,provideClientHydration,withNoIncrementalHydration} from '@angular/platform-browser'; import {provideServerRendering} from '@angular/platform-server'; import {withNgDocContentReady} from '@ng-doc/app/helpers'; import {App} from './app'; import {providers} from './providers'; const bootstrap=(context:BootstrapContext)=>bootstrapApplication(App,{providers:[...providers,provideServerRendering(),provideClientHydration(withNoIncrementalHydration())]},context); export default withNgDocContentReady(bootstrap);\n`,
    files,
  );
  await put(
    root,
    'src/demo.ts',
    'import {Component} from \'@angular/core\'; @Component({selector:\'benchmark-demo\',standalone:true,template:\'<button data-testid="benchmark-demo-button" class="demo-button" (click)="count=count+1">Benchmark demo</button><output data-testid="benchmark-demo-count">{{count}}</output>\',styleUrls:[\'./demo.css\']}) export class BenchmarkDemo { count=0; }\n',
    files,
  );
  await put(root, 'src/demo.css', '.demo-button{border:1px solid #345;padding:4px 8px}\n', files);
  await put(
    root,
    'public/assets/benchmark.css',
    '.benchmark-demo{padding:4px;background:#f4f7fb}\n',
    files,
  );
  await put(root, 'docs/shared/header.nunj', `Shared benchmark header seed=${seed}.\n`, files);

  for (let category = 1; category <= categories; category += 1) {
    const id = String(category).padStart(2, '0');
    await put(
      root,
      `docs/category-${id}/ng-doc.category.ts`,
      `const category={title:'Category ${category}',route:'category-${id}'}; export default category;\n`,
      files,
    );
    await put(
      root,
      `docs/category-${id}/section/ng-doc.category.ts`,
      `import parent from '../ng-doc.category'; const category={title:'Section ${category}',route:'section-${id}',category:parent}; export default category;\n`,
      files,
    );
  }
  for (let index = 1; index <= guides; index += 1) {
    const guide = guideSource(index, guides, sharedConsumers.includes(index));
    const id = String(index).padStart(4, '0');
    const category = String(guide.category).padStart(2, '0');
    await put(
      root,
      `docs/category-${category}/section/guide-${id}/ng-doc.page.ts`,
      `import category from '../ng-doc.category'; import {BenchmarkDemo} from '../../../../src/demo'; const page={title:${JSON.stringify(guide.title)},route:${JSON.stringify(guide.route)},category,mdFile:'./page.md.nunj',demos:{BenchmarkDemo}}; export default page;\n`,
      files,
    );
    await put(
      root,
      `docs/category-${category}/section/guide-${id}/page.md.nunj`,
      `---\nkeyword: BenchmarkGuide${id}\ntitle: ${guide.title}\n---\n${guide.body}`,
      files,
    );
  }

  const apiFiles = [];
  const apiPerFile = apiDeclarations ? Math.ceil(apiDeclarations / 20) : 0;
  for (let fileIndex = 0; fileIndex < 20 && apiDeclarations; fileIndex += 1) {
    const start = fileIndex * apiPerFile + 1;
    const end = Math.min(apiDeclarations, start + apiPerFile - 1);
    if (start > end) break;
    const relative = `src/api/api-${String(fileIndex + 1).padStart(2, '0')}.ts`;
    apiFiles.push(relative);
    await put(
      root,
      relative,
      Array.from({ length: end - start + 1 }, (_, offset) => apiSource(start + offset)).join('\n'),
      files,
    );
  }
  if (apiDeclarations) {
    await put(
      root,
      'docs/api/ng-doc.api.ts',
      "const api={title:'Benchmark API',route:'api',scopes:[{name:'Public',route:'public',include:['src/api/**/*.ts']}]}; export default api;\n",
      files,
    );
  }
  await put(
    root,
    'negative/invalid-template.md.nunj',
    `# ${INVALID_CONTENT_MARKER}\n\n{% include "./missing-required-include.nunj" %}\n`,
    files,
  );

  const sourceHashes = Object.fromEntries(
    files
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(({ path: file, sha256: digest }) => [file, digest]),
  );
  const metadata = {
    schema: 't19-fixture-v1',
    seed,
    guides,
    apiDeclarations,
    categories,
    sharedFanout: sharedConsumers,
    expected: {
      guideRoutes: guides,
      guideKeywords: Array.from(
        { length: guides },
        (_, i) => `BenchmarkGuide${String(i + 1).padStart(4, '0')}`,
      ),
      apiDeclarations,
      apiIdentities: Array.from({ length: apiDeclarations }, (_, i) => apiIdentity(i + 1)),
      apiFiles: apiFiles.length,
    },
    editPaths: {
      localBody: `docs/category-01/section/guide-0001/page.md.nunj`,
      sharedInclude: 'docs/shared/header.nunj',
      apiDiscoveryTarget: 'src/api/discovered/new-declaration.ts',
      apiContent: apiFiles[0] ?? null,
    },
    foreground: {
      route: '/preview/docs/category-01/section-01/guide-0001',
      marker: 'This deterministic body belongs to guide 1.',
      demoButtonTestId: 'benchmark-demo-button',
      demoCountTestId: 'benchmark-demo-count',
    },
    negative: {
      invalidContentMarker: INVALID_CONTENT_MARKER,
      path: 'negative/invalid-template.md.nunj',
    },
    sourceHashes,
  };
  await writeFile(path.join(root, 'fixture-manifest.json'), json(metadata), 'utf8');
  return metadata;
}

export { INVALID_CONTENT_MARKER };
