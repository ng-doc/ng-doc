import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepare } from '../../../../../plugins/semantic-release/update-dependencies.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(directory, '../../../../..');
const evidence = path.resolve(process.env.NGDOC_PACKAGE_CONSUMER_EVIDENCE ?? '');
const expected = process.env.NGDOC_EXPECTED_SOURCE_DIGEST;
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(
  process.env.NGDOC_PACKAGE_CONSUMER_EVIDENCE,
  'NGDOC_PACKAGE_CONSUMER_EVIDENCE is required',
);
assert.match(expected ?? '', /^[a-f0-9]{64}$/, 'NGDOC_EXPECTED_SOURCE_DIGEST is required');
assert.match(
  process.version,
  /^v24\.(?:15|19|21)\.0$/,
  'Use an explicitly supported Node 24 line probe',
);
assert.notEqual(process.platform, 'win32');
await mkdir(evidence, { recursive: true });
assert.deepEqual(
  (await readdir(evidence)).filter((name) => name !== 'outer.log'),
  [],
  'Use a fresh evidence directory for every package-consumer run',
);
const runtime = await mkdtemp(path.join(os.tmpdir(), 'ngdoc-package-consumer-'));
const snapshot = path.join(runtime, 'packages');
const consumer = path.join(runtime, 'consumer');
const node = process.execPath;
const summary = { status: 'running', node: process.version, runtime, checks: [], commands: [] };
const active = new Set();
const joinTasks = new Map();
let interrupted;
let signalCleanup = Promise.resolve();

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    throw error;
  }
}
function signalGroup(pid, signal) {
  try {
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
async function joinGroup(pid) {
  if (!groupAlive(pid)) return false;
  signalGroup(pid, 'SIGTERM');
  for (let index = 0; index < 100 && groupAlive(pid); index++) await delay(50);
  if (groupAlive(pid)) signalGroup(pid, 'SIGKILL');
  for (let index = 0; index < 100 && groupAlive(pid); index++) await delay(50);
  assert.equal(groupAlive(pid), false, `Owned process group ${pid} survived cleanup`);
  return true;
}
/** What is left in the given process groups, for the evidence of a forced cleanup. */
function groupMembers(groups) {
  if (!groups.length) return [];
  try {
    return execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,stat=,command='], {
      encoding: 'utf8',
    })
      .split('\n')
      .flatMap((row) => {
        const match = row.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
        return match && groups.includes(Number(match[3]))
          ? [
              {
                pid: Number(match[1]),
                ppid: Number(match[2]),
                pgid: Number(match[3]),
                stat: match[4],
                command: match[5].slice(0, 300),
              },
            ]
          : [];
      });
  } catch (error) {
    return [{ error: String(error) }];
  }
}
function joinOwned(pid) {
  const current = joinTasks.get(pid);
  if (current) return current;
  const joined = joinGroup(pid)
    .then((forced) => {
      active.delete(pid);
      return forced;
    })
    .finally(() => {
      joinTasks.delete(pid);
    });
  joinTasks.set(pid, joined);
  return joined;
}
function discoverOwnedGroups() {
  const rows = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,command='], {
    encoding: 'utf8',
  })
    .split('\n')
    .flatMap((row) => {
      const match = row.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
      return match
        ? [{ pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]) }]
        : [];
    });
  const descendants = new Set(active);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (!descendants.has(row.ppid) || descendants.has(row.pid)) continue;
      descendants.add(row.pid);
      changed = true;
    }
  }
  for (const row of rows) {
    if (descendants.has(row.pid) && row.pgid > 1) active.add(row.pgid);
  }
  return [...active];
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    if (interrupted) return;
    interrupted = signal;
    summary.interrupted = signal;
    summary.status = 'failed';
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    try {
      discoverOwnedGroups();
    } catch (error) {
      summary.signalDiscoveryError = String(error);
    }
    signalCleanup = Promise.allSettled([...active].map((pid) => joinOwned(pid))).then((results) => {
      summary.signalCleanup = results.map((result) =>
        result.status === 'fulfilled'
          ? { status: result.status, forced: result.value }
          : { status: result.status, reason: String(result.reason) },
      );
    });
  });
}

async function run(name, command, args, cwd = consumer, timeout = 300_000, trackOwned = false) {
  assert.equal(interrupted, undefined, `Refusing ${name} after ${interrupted}`);
  const env = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}:${process.env.PATH}`,
    CI: 'true',
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_TUI: 'false',
    npm_config_cache: path.join(runtime, 'npm-cache'),
  };
  delete env.NODE_PATH;
  const child = spawn(command, args, {
    cwd,
    env,
    detached: true,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pid = child.pid;
  if (pid) active.add(pid);
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let overflow = false;
  const collect = (kind, chunk) => {
    if (kind === 'stdout') stdout += chunk;
    else stderr += chunk;
    if (trackOwned && kind === 'stdout') {
      for (const match of stdout.matchAll(/^NGDOC_OWNED (\d+)$/gm)) {
        const owned = Number(match[1]);
        if (Number.isSafeInteger(owned) && owned > 1) active.add(owned);
      }
    }
    if (stdout.length + stderr.length > 30 * 1024 * 1024 && !overflow) {
      overflow = true;
      if (pid) signalGroup(pid, 'SIGKILL');
    }
  };
  child.stdout.on('data', (chunk) => collect('stdout', chunk));
  child.stderr.on('data', (chunk) => collect('stderr', chunk));
  const began = Date.now();
  let force;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      discoverOwnedGroups();
    } catch (error) {
      summary.timeoutDiscoveryError = String(error);
    }
    for (const owned of active) signalGroup(owned, 'SIGTERM');
    force = setTimeout(() => {
      for (const owned of active) signalGroup(owned, 'SIGKILL');
    }, 10_000);
  }, timeout);
  let exit;
  let spawnError;
  try {
    exit = await new Promise((resolve) => {
      child.once('error', (error) => {
        spawnError = error;
        resolve({ code: null, signal: null });
      });
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(timer);
    clearTimeout(force);
  }
  const joined = [];
  const joinErrors = [];
  // Recorded before the join kills them: a forced cleanup names what outlived the command.
  const leftovers = groupMembers(
    [...active].filter((owned) => {
      try {
        return groupAlive(owned);
      } catch {
        return true;
      }
    }),
  );
  for (const owned of [...active]) {
    const [result] = await Promise.allSettled([joinOwned(owned)]);
    if (result.status === 'fulfilled' && result.value) joined.push(owned);
    if (result.status === 'rejected')
      joinErrors.push({ group: owned, reason: String(result.reason) });
  }
  const forcedCleanup = joined.length > 0;
  const outcome = {
    name,
    command,
    args,
    cwd,
    pid,
    ...exit,
    durationMs: Date.now() - began,
    timedOut,
    overflow,
    forcedCleanup,
    joinErrors,
    leftovers,
    spawnError: spawnError instanceof Error ? spawnError.message : undefined,
    ownedGroups: trackOwned
      ? [...new Set([...stdout.matchAll(/^NGDOC_OWNED (\d+)$/gm)].map((match) => Number(match[1])))]
      : [],
  };
  summary.commands.push(outcome);
  await writeFile(
    path.join(evidence, `${name}.log`),
    `${JSON.stringify(outcome)}\n${stdout}\n${stderr}`,
  );
  assert.deepEqual(joinErrors, [], `${name} process-group cleanup failed`);
  assert.equal(timedOut || overflow || forcedCleanup, false, `${name} exceeded process bounds`);
  assert.equal(spawnError, undefined, `${name} could not start: ${spawnError}`);
  assert.equal(exit.code, 0, `${name} failed: ${stderr.slice(-4000)}`);
  return { stdout, stderr, outcome };
}

async function put(relative, value) {
  const target = path.join(consumer, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value);
  return target;
}

try {
  const names = ['builder', 'core', 'utils', 'app', 'ui-kit', 'keywords-loaders'];
  for (const name of names)
    await cp(path.join(repository, 'dist/libs', name), path.join(snapshot, name), {
      recursive: true,
    });
  const readManifests = async () =>
    Object.fromEntries(
      await Promise.all(
        names.map(async (name) => [
          name,
          JSON.parse(await readFile(path.join(snapshot, name, 'package.json'), 'utf8')),
        ]),
      ),
    );
  const before = await readManifests();
  assert.deepEqual([...new Set(Object.values(before).map(({ version }) => version))], ['0.0.1']);
  prepare(
    { packages: names.map((name) => path.join(snapshot, name)) },
    { logger: { log: () => undefined } },
  );
  const after = await readManifests();
  summary.releasePreparation = {
    snapshotOnly: true,
    changes: names.flatMap((name) =>
      Object.entries(after[name].dependencies ?? {}).flatMap(([dependency, version]) =>
        before[name].dependencies?.[dependency] === version
          ? []
          : [
              {
                package: after[name].name,
                dependency,
                before: before[name].dependencies?.[dependency],
                after: version,
              },
            ],
      ),
    ),
  };
  const provenance = JSON.parse(
    await readFile(path.join(snapshot, 'builder/generator/build-provenance.json'), 'utf8'),
  );
  assert.equal(provenance.sourceDigest, expected);
  summary.provenance = provenance;
  summary.harnessSha256 = sha(await readFile(fileURLToPath(import.meta.url)));

  const tarballs = {};
  summary.packages = {};
  for (const name of names) {
    const packed = await run(`pack-${name}`, 'npm', ['pack', '--json'], path.join(snapshot, name));
    const [metadata] = JSON.parse(packed.stdout);
    const file = path.join(snapshot, name, metadata.filename);
    tarballs[`@ng-doc/${name}`] = `file:${file}`;
    summary.packages[name] = {
      filename: metadata.filename,
      sha256: sha(await readFile(file)),
      integrity: metadata.integrity,
      fileCount: metadata.entryCount,
      unpackedSize: metadata.unpackedSize,
    };
  }

  const tuple = {
    // The ranges `ng add` and `migrate-to-vite` add: npm resolves the newest releases.
    '@analogjs/vite-plugin-angular': '^2.8.0',
    '@angular/animations': '22.2.1',
    '@angular/build': '22.2.1',
    '@angular/cdk': '22.0.6',
    '@angular/common': '22.2.1',
    '@angular/compiler': '22.2.1',
    '@angular/compiler-cli': '22.2.1',
    '@angular/core': '22.2.1',
    '@angular/forms': '22.2.1',
    '@angular/platform-browser': '22.2.1',
    '@angular/platform-server': '22.2.1',
    '@angular/router': '22.2.1',
    '@angular-devkit/architect': '0.2202.1',
    '@angular-devkit/build-angular': '22.2.1',
    '@angular-devkit/core': '22.2.1',
    '@angular-devkit/schematics': '22.2.1',
    '@ng-web-apis/common': '4.12.2',
    '@parcel/watcher': '2.5.6',
    '@taiga-ui/polymorpheus': '5.0.1',
    'di-controls': '2.1.0',
    rxjs: '7.8.2',
    tslib: '2.8.1',
    typescript: '6.0.3',
    // The Vite engine's range; the builder's optional peer must accept the tree it installs.
    vite: '^8.3.0',
    vitest: '4.1.11',
    'zone.js': '0.16.2',
  };
  const packageJson = {
    name: 'ngdoc-external-package-consumer',
    version: '1.0.0',
    private: true,
    type: 'module',
    dependencies: { ...tarballs, ...tuple },
  };
  await put('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(
    path.join(evidence, 'consumer-package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
  await run('npm-install', 'npm', ['install', '--no-audit', '--no-fund']);
  const treeResult = await run('npm-tree', 'npm', ['ls', '--all', '--json']);
  const tree = JSON.parse(treeResult.stdout);
  await writeFile(path.join(evidence, 'npm-tree.json'), `${JSON.stringify(tree, null, 2)}\n`);
  const lockBytes = await readFile(path.join(consumer, 'package-lock.json'));
  await writeFile(path.join(evidence, 'package-lock.json'), lockBytes);
  const lock = JSON.parse(lockBytes.toString('utf8'));
  const installedNgDoc = Object.entries(lock.packages)
    .filter(([key]) =>
      /^node_modules\/@ng-doc\/(?:builder|core|utils|app|ui-kit|keywords-loaders)$/.test(key),
    )
    .map(([key, value]) => ({
      key,
      version: value.version,
      resolved: value.resolved,
      link: value.link === true,
    }));
  assert.equal(installedNgDoc.length, 6);
  assert.equal(
    installedNgDoc.some(({ link }) => link),
    false,
  );
  assert.equal(
    installedNgDoc.every(
      ({ resolved }) => typeof resolved === 'string' && resolved.endsWith('.tgz'),
    ),
    true,
  );
  assert.match(
    lock.packages['node_modules/vite']?.version ?? '',
    /^8\.(?:[3-9]|\d{2,})\.\d+$/,
    'The root Vite must be inside the range the Vite engine requires (^8.3.0)',
  );
  summary.install = {
    lockSha256: sha(lockBytes),
    installedNgDoc,
    childNodePathDeleted: true,
    vitePackages: Object.entries(lock.packages)
      .filter(([key]) => /(?:^|\/)node_modules\/vite$/.test(key))
      .map(([key, value]) => ({ path: key, version: value.version })),
  };
  summary.checks.push(
    'Fresh external npm consumer installed six real tarballs without workspace links or NODE_PATH resolution',
  );

  await put(
    'tsconfig.json',
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          strict: true,
          experimentalDecorators: true,
          skipLibCheck: true,
          types: ['vite/client'],
          paths: {
            '@ng-doc/generated': ['./generated/index.ts'],
            '@ng-doc/generated/*': ['./generated/*'],
          },
        },
        angularCompilerOptions: { strictTemplates: true },
        include: ['src/**/*.ts', 'docs/**/*.ts', 'generated/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await put(
    'ng-doc.config.mjs',
    "export default {docsPath:'docs',tsConfig:'tsconfig.json',routePrefix:'docs',cache:true};\n",
  );
  await put(
    'docs/ng-doc.page.ts',
    "import {PackedDemo} from '../src/packed-demo'; const page={title:'Packed guide',route:'packed',mdFile:'./packed.md',demos:{PackedDemo}}; export default page;\n",
  );
  await put(
    'docs/packed.md',
    '# Packed guide\n\nExternal tarball content one.\n\n{{ NgDocActions.demo("PackedDemo", {expanded:true}) }}\n\n![Packed asset](/preview/packed.svg)\n',
  );
  await put(
    'src/packed-demo.ts',
    "import {Component} from '@angular/core'; @Component({selector:'packed-demo',standalone:true,templateUrl:'./packed-demo.html',styleUrl:'./packed-demo.scss'}) export class PackedDemo{count=0;increment(){this.count++;}}\n",
  );
  await put(
    'src/packed-demo.html',
    '<button data-testid="packed-demo" (click)="increment()">Packed demo {{count}}</button>\n',
  );
  await put(
    'src/packed-demo.scss',
    '[data-testid="packed-demo"]{background-color:rgb(12,34,56)}\n',
  );
  await put(
    'public/packed.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="green"/></svg>\n',
  );
  await cp(
    path.join(consumer, 'node_modules/@ng-doc/ui-kit/assets'),
    path.join(consumer, 'public/assets/ng-doc/ui-kit'),
    { recursive: true },
  );

  // The consumer brings its own watcher, as a host may. It names inotify on Linux, as NgDoc's own
  // watcher does: @parcel/watcher's default there probes for Watchman through popen and, without
  // Watchman, never reaps the probe's shell, so the host would exit with a zombie in its group.
  // The host is its group's leader (`run` starts it detached), so after dispose it checks that
  // nothing else is in that group, zombies included, instead of relying on the harness winning a
  // race with the reaping of orphans after it exited.
  await put(
    'b-lifecycle.mjs',
    `import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createGeneratorBuildSession} from '@ng-doc/builder/generator/bootstrap/index.js';
import * as parcel from '@parcel/watcher';
const root=process.cwd();
const options=(output,cache)=>({projectId:'package-consumer-b',workspaceRoot:root,configFile:path.join(root,'ng-doc.config.mjs'),defaults:{docsRoot:path.join(root,'docs'),tsConfig:path.join(root,'tsconfig.json'),outputRoot:path.join(root,output),cacheRoot:path.join(root,cache)}});
const once=createGeneratorBuildSession(options('b-once','b-cache-once'));
let built; try{built=await once.buildOnce({mode:'production'}); assert.equal(built.status,'success'); assert.equal(built.diagnostics.some(item=>item.severity==='error'),false);} finally{await once.dispose();}
const watched=createGeneratorBuildSession(options('b-watch','b-cache-watch'));
const guideHtml=result=>result.status==='success'?result.snapshot.artifacts.flatMap(artifact=>artifact.content).find(item=>item.ir.role==='guide-tab')?.html:undefined;
let handle; let initial; let next; let timer; let resolveUpdate; const updated=new Promise(resolve=>resolveUpdate=resolve); let initialGeneration=0;
const source={async subscribe(listener,onError){const subscription=await parcel.subscribe(root,(error,events)=>{if(error){onError({code:'PACKAGE_CONSUMER_WATCH',message:String(error),severity:'error',stage:'host'});return;} listener(events.map(event=>({kind:event.type,path:event.path})));},{ignore:['**/node_modules/**','**/b-once/**','**/b-watch/**','**/b-cache-*/**','**/generated/**','**/browser/**','**/server/**'],...(process.platform==='linux'?{backend:'inotify'}:{})}); return {dispose:()=>subscription.unsubscribe()};}};
try{handle=await watched.watch(source,event=>{if(event.kind==='result'&&event.result.generation>initialGeneration&&guideHtml(event.result)?.includes('External tarball content two.'))resolveUpdate?.(event.result);});
initial=await handle.initial; assert.equal(initial.status,'success'); initialGeneration=initial.generation; assert.match(guideHtml(initial),/External tarball content one\\./);
const guide=path.join(root,'docs/packed.md'); await writeFile(guide,(await readFile(guide,'utf8')).replace('content one','content two'));
try{next=await Promise.race([updated,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('watch update timed out')),60000);})]);} finally{clearTimeout(timer);}
assert.equal(next.status,'success'); assert.match(guideHtml(next),/External tarball content two\\./);
} finally{await handle?.dispose(); await watched.dispose();}
const leftInGroup=execFileSync('/bin/ps',['-axo','pid=,pgid=,stat=,command='],{encoding:'utf8'}).split('\\n').map(row=>row.trim().split(/\\s+/)).filter(([pid,pgid,,command])=>Number(pgid)===process.pid&&Number(pid)!==process.pid&&command!=='/bin/ps').map(row=>row.join(' '));
assert.deepEqual(leftInGroup,[],'Nothing but the host may be left in its process group after dispose');
console.log(JSON.stringify({buildOnce:{generation:built.generation,revision:built.snapshot.revision},watch:{initial:initial.generation,updated:next.generation},disposed:true}));
`,
  );
  await run('b-lifecycle-syntax', node, ['--check', 'b-lifecycle.mjs']);
  const bLifecycle = await run('b-lifecycle', node, ['b-lifecycle.mjs']);
  summary.bLifecycle = JSON.parse(bLifecycle.stdout);
  summary.checks.push(
    'Installed generator bootstrap completed buildOnce, native watch update, watch disposal, and session disposal',
  );

  await put(
    'src/app.ts',
    `import {Component} from '@angular/core';
import {provideHttpClient,withFetch} from '@angular/common/http';
import {RouterOutlet} from '@angular/router';
import {NgDocRootComponent,NgDocSidebarComponent,NG_DOC_DEFAULT_PAGE_PROCESSORS,NG_DOC_DEFAULT_PAGE_SKELETON,provideMainPageProcessor,provideNgDocApp,providePageSkeleton} from '@ng-doc/app';
import {provideNgDocContext} from '@ng-doc/generated';
@Component({selector:'app-root',standalone:true,imports:[RouterOutlet,NgDocRootComponent,NgDocSidebarComponent],template:'<ng-doc-root [sidebar]="true"><ng-doc-sidebar></ng-doc-sidebar><router-outlet></router-outlet></ng-doc-root>'}) export class App{}
export const providers=[provideHttpClient(withFetch()),provideNgDocApp(),provideNgDocContext(),providePageSkeleton(NG_DOC_DEFAULT_PAGE_SKELETON),provideMainPageProcessor(NG_DOC_DEFAULT_PAGE_PROCESSORS)];
`,
  );
  await put(
    'src/main.ts',
    `import 'zone.js'; import '@ng-doc/app/styles/global.css'; import {bootstrapApplication} from '@angular/platform-browser'; import {provideRouter} from '@angular/router'; import {NG_DOC_ROUTING} from '@ng-doc/generated'; import {App,providers} from './app'; bootstrapApplication(App,{providers:[...providers,provideRouter([{path:'docs',children:NG_DOC_ROUTING}])]}).then(()=>document.body.dataset.bootstrapped='yes');\n`,
  );
  await put(
    'src/ssr-render.ts',
    `import 'zone.js/node'; import {enableProdMode} from '@angular/core'; import {bootstrapApplication,BootstrapContext} from '@angular/platform-browser'; import {provideServerRendering,renderApplication} from '@angular/platform-server'; import {provideRouter,withEnabledBlockingInitialNavigation} from '@angular/router'; import {withNgDocContentReady} from '@ng-doc/app/helpers'; import {NG_DOC_ROUTING} from '@ng-doc/generated'; import {App,providers} from './app'; enableProdMode(); export async function render(request:{document:string;url:string},{signal}:{signal:AbortSignal}){signal.throwIfAborted(); return renderApplication(withNgDocContentReady((context:BootstrapContext)=>bootstrapApplication(App,{providers:[...providers,provideRouter([{path:'docs',children:NG_DOC_ROUTING}],withEnabledBlockingInitialNavigation()),provideServerRendering()]},context)),{document:request.document,url:request.url,allowedHosts:['127.0.0.1','localhost']});}\n`,
  );
  await put('src/server-build.ts', `export {render} from './ssr-render';\n`);
  await put(
    'index.html',
    '<!doctype html><html><head><base href="/preview/"><link rel="icon" href="data:,"></head><body><app-root></app-root><script type="module" src="/src/main.ts"></script></body></html>\n',
  );
  const linkedCoreImports = new Set(['@ng-doc/core']);
  for (const library of ['app', 'ui-kit']) {
    const modules = path.join(consumer, `node_modules/@ng-doc/${library}/fesm2022`);
    for (const file of await readdir(modules)) {
      if (!file.endsWith('.mjs')) continue;
      for (const match of (await readFile(path.join(modules, file), 'utf8')).matchAll(
        /['"](@ng-doc\/core(?:\/[^'"]*)?)['"]/g,
      ))
        linkedCoreImports.add(match[1]);
    }
  }
  summary.linkedCoreImports = [...linkedCoreImports].sort();
  await put(
    'vite.config.mjs',
    `import path from 'node:path'; import {fileURLToPath} from 'node:url';
import {createNgDocAngularPlugins as angular} from '@ng-doc/builder/generator/vite/angular/index.js';
import {createNgDocVitePlugin} from '@ng-doc/builder/generator/vite/index.js';
export const root=fileURLToPath(new URL('.',import.meta.url));
const linkedCoreImports=${JSON.stringify([...linkedCoreImports].sort())};
export function setup(command='serve'){
 const ngDocPlugins=createNgDocVitePlugin({analogLiveReload:true,angularPlugins:angular({liveReload:true,tsconfig:path.join(root,'tsconfig.json'),workspaceRoot:root,disableTypeChecking:false,jit:false,inlineStylesExtension:'scss'}),angularComponentProbe:path.join(root,'src/app.ts'),generator:{projectId:'package-consumer-vite',workspaceRoot:root,configFile:path.join(root,'ng-doc.config.mjs'),defaults:{docsRoot:path.join(root,'docs'),tsConfig:path.join(root,'tsconfig.json'),outputRoot:path.join(root,'generated'),cacheRoot:path.join(root,'cache')}}});
 const config={root,configFile:false,base:'/preview/',plugins:[ngDocPlugins],publicDir:path.join(root,'public'),cacheDir:path.join(root,'vite-cache'),optimizeDeps:{include:linkedCoreImports},resolve:{dedupe:['@angular/core','@angular/common','@angular/compiler','@angular/platform-browser','@angular/router']},css:{preprocessorOptions:{scss:{loadPaths:[root]}}},build:{outDir:path.join(root,'browser'),sourcemap:true},ssr:command==='build'?{noExternal:true}:{noExternal:[/^@angular\\//,/^@ng-doc\\//,/^@ng-web-apis\\//,/^@taiga-ui\\//,/^di-controls$/],optimizeDeps:{include:linkedCoreImports}}};
 return {config,ngDocPlugins};
}
export default ({command})=>setup(command).config;
`,
  );
  await put(
    'public-api.ts',
    `import type {Plugin} from 'vite'; import {createNgDocVitePlugin,getNgDocViteSsrRenderer} from '@ng-doc/builder/generator/vite/index.js'; import {createNgDocAngularPlugins} from '@ng-doc/builder/generator/vite/angular/index.js'; declare const options:Parameters<typeof createNgDocVitePlugin>[0]; const plugins:Plugin[]=createNgDocVitePlugin({...options,angularPlugins:createNgDocAngularPlugins({liveReload:true})}); const renderer=getNgDocViteSsrRenderer(plugins,{entry:'/src/ssr-render.ts'}); void renderer; // @ts-expect-error entry must be a Vite module id string\ngetNgDocViteSsrRenderer(plugins,{entry:42});\n`,
  );
  const serveSmoke = await readFile(path.join(directory, 'serve-smoke.mjs'));
  await cp(path.join(directory, 'serve-smoke.mjs'), path.join(consumer, 'serve-smoke.mjs'));
  const copiedServeSmoke = await readFile(path.join(consumer, 'serve-smoke.mjs'));
  assert.deepEqual(copiedServeSmoke, serveSmoke);
  summary.serveSmokeSha256 = sha(copiedServeSmoke);
  for (const module of ['ng-doc.config.mjs', 'vite.config.mjs', 'serve-smoke.mjs'])
    await run(`syntax-${module.replaceAll('.', '-')}`, node, ['--check', module]);
  await run('public-api-typecheck', path.join(consumer, 'node_modules/.bin/tsc'), [
    '--ignoreConfig',
    '--noEmit',
    '--strict',
    '--module',
    'esnext',
    '--moduleResolution',
    'bundler',
    'public-api.ts',
  ]);
  summary.checks.push(
    'Packed Vite, Angular compatibility, and isolated renderer public declarations resolve under strict consumer type checking',
  );
  await run(
    'vite-client-build',
    path.join(consumer, 'node_modules/.bin/vite'),
    ['build'],
    consumer,
    420_000,
  );
  const browserFiles = await readdir(path.join(consumer, 'browser'), { recursive: true });
  assert.ok(browserFiles.some((file) => String(file).endsWith('.js')));
  assert.ok(browserFiles.some((file) => String(file).endsWith('.css')));
  await run(
    'vite-ssr-build',
    path.join(consumer, 'node_modules/.bin/vite'),
    ['build', '--ssr', 'src/server-build.ts', '--outDir', 'server'],
    consumer,
    420_000,
  );
  assert.ok(
    (await readdir(path.join(consumer, 'server'), { recursive: true })).some((file) =>
      String(file).endsWith('.js'),
    ),
  );
  summary.checks.push(
    'Fresh tarball consumer completed real Analog Angular client and SSR Vite builds with demo and styles',
  );
  const serve = await run(
    'vite-serve-ssr-smoke',
    node,
    ['serve-smoke.mjs'],
    consumer,
    300_000,
    true,
  );
  summary.serve = JSON.parse(
    serve.stdout
      .trim()
      .split('\n')
      .findLast((line) => line.startsWith('{')),
  );
  summary.checks.push(
    'Real packed Vite serve rendered and styled an interactive demo, served a public asset, and isolated SSR returned the same generated route',
  );

  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed';
  summary.error = error instanceof Error ? error.stack ?? error.message : String(error);
  if (!interrupted) process.exitCode = 1;
} finally {
  const cleanupErrors = [];
  const signalResult = await Promise.allSettled([signalCleanup]);
  if (signalResult[0].status === 'rejected') cleanupErrors.push(signalResult[0].reason);
  try {
    discoverOwnedGroups();
  } catch (error) {
    cleanupErrors.push(error);
  }
  for (const pid of [...active]) {
    const [result] = await Promise.allSettled([joinOwned(pid)]);
    if (result.status === 'rejected') cleanupErrors.push(result.reason);
  }
  if (interrupted) summary.status = 'failed';
  if (cleanupErrors.length) {
    summary.status = 'failed';
    summary.cleanupErrors = cleanupErrors.map(String);
    if (!interrupted) process.exitCode = 1;
  }
  const keep = process.env.NGDOC_PACKAGE_CONSUMER_KEEP === '1';
  if (!keep) {
    const [removeResult] = await Promise.allSettled([
      rm(runtime, { recursive: true, force: true }),
    ]);
    if (removeResult.status === 'rejected') {
      cleanupErrors.push(removeResult.reason);
      summary.status = 'failed';
      summary.cleanupErrors = cleanupErrors.map(String);
      if (!interrupted) process.exitCode = 1;
    }
  }
  if (interrupted) summary.status = 'failed';
  summary.cleanup = {
    runtime,
    retained: keep,
    removed: !keep && !existsSync(runtime),
    activeGroups: [...active],
  };
  await writeFile(path.join(evidence, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(
    JSON.stringify({
      status: summary.status,
      checks: summary.checks.length,
      cleanup: summary.cleanup,
    }),
  );
}
