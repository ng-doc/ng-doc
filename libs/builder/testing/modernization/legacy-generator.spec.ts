import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

interface CapturedFile {
  path: string;
  sha256: string;
  mtimeMs: number;
  normalized: string;
}
interface Capture {
  files: CapturedFile[];
  diagnostics: string[];
  emissions?: number;
  nativeEvents?: Array<{ path: string; type: string }>;
}

const workspaceRoot = path.resolve(__dirname, '../../../..');
const node = process.execPath;
const child = path.join(__dirname, 'legacy-generator-child.cjs');

function write(root: string, relativePath: string, content: string): void {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function fixture(root: string): void {
  write(
    root,
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'commonjs',
        moduleResolution: 'node',
        experimentalDecorators: true,
        skipLibCheck: true,
      },
    }),
  );
  fs.symlinkSync(path.join(workspaceRoot, 'node_modules'), path.join(root, 'node_modules'), 'dir');
  write(root, 'ng-doc.config.ts', 'export default {};\n');
  write(
    root,
    'docs/ng-doc.category.ts',
    `import type { NgDocCategory } from '@ng-doc/core';\nconst category: NgDocCategory = { title: 'Fixture category', route: 'fixture', order: 1, providers: [{ provide: 'fixture-token', useValue: 'category-value' }] };\nexport default category;\n`,
  );
  write(
    root,
    'docs/guide/demo.component.ts',
    `import { Component } from '@angular/core';\n@Component({ selector: 'fixture-demo', standalone: true, templateUrl: './demo.component.html', styleUrl: './demo.component.css' })\nexport class FixtureDemoComponent {}\n`,
  );
  write(root, 'docs/guide/demo.component.html', '<p>fixture demo</p>\n');
  write(root, 'docs/guide/demo.component.css', ':host { display: block; }\n');
  write(
    root,
    'docs/guide/playground.component.ts',
    `import { Component, Input } from '@angular/core';\n@Component({ selector: 'fixture-playground', standalone: true, template: '<span>{{label}}</span>' })\nexport class FixturePlaygroundComponent { @Input() label = 'fixture'; }\n`,
  );
  write(
    root,
    'docs/guide/ng-doc.page.ts',
    `import { NgDocPage } from '@ng-doc/core';\nimport category from '../ng-doc.category';\nimport { FixtureDemoComponent } from './demo.component';\nimport { FixturePlaygroundComponent } from './playground.component';\nconst page: NgDocPage = { title: 'Fixture guide', category: category, route: 'guide', mdFile: ['./index.md', './second.md'], demos: { FixtureDemoComponent }, playgrounds: { FixturePlayground: { target: FixturePlaygroundComponent, template: '<ng-doc-selector></ng-doc-selector>', data: { label: 'fixture' } } } };\nexport default page;\n`,
  );
  write(
    root,
    'docs/guide/index.md',
    `---\ntitle: Fixture tab\nkeyword: FixtureKeyword\n---\n# Fixture heading\n\n{{ NgDocActions.demo('FixtureDemoComponent') }}\n\n{{ NgDocActions.playground('FixturePlayground') }}\n`,
  );
  write(
    root,
    'docs/guide/second.md',
    '---\ntitle: Second tab\nroute: second\n---\n# Second heading\n\nA linked `FixtureKeyword`.\n',
  );
  write(
    root,
    'docs/api.ts',
    `/** Fixture API description */\nexport class FixtureApi { value = 'fixture'; }\nexport function fixtureFn(value: string): string { return value; }\n`,
  );
  write(
    root,
    'docs/ng-doc.api.ts',
    `import { NgDocApi } from '@ng-doc/core';\nconst api: NgDocApi = { title: 'Fixture API', keyword: 'FixtureApi', scopes: [{ name: 'fixture', route: 'fixture-api', include: 'docs/api*.ts' }] };\nexport default api;\n`,
  );
}

function run(root: string, outDir: string, cache: boolean = false): Capture {
  const result = spawnSync(node, [child, root, outDir], {
    cwd: root,
    encoding: 'utf8',
    // Above the child's 30 s readiness bound (a cold legacy build loads every Shiki grammar).
    timeout: 45_000,
    env: {
      ...process.env,
      PATH: `${path.dirname(node)}:${process.env.PATH}`,
      CACHE_DIR: path.join(root, '.cache'),
      NGDOC_TEST_CACHE: cache ? '1' : '0',
    },
  });
  if (result.status !== 0) throw new Error(`legacy child failed: ${result.stderr}`);
  return JSON.parse(result.stdout) as Capture;
}

function watch(root: string, outDir: string) {
  const watcherProcess = spawn(node, [child, root, outDir, 'watch'], {
    cwd: root,
    env: { ...process.env, PATH: `${path.dirname(node)}:${process.env.PATH}` },
  });
  const events: Capture[] = [];
  let notify: (() => void) | undefined;
  let exited: Error | undefined;
  let stderr = '';
  let buffer = '';
  watcherProcess.stderr.on('data', (chunk) => {
    stderr = (stderr + chunk).slice(-12000);
  });
  watcherProcess.stdout.setEncoding('utf8');
  watcherProcess.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) {
        try {
          events.push(JSON.parse(line) as Capture);
        } catch (error) {
          exited = new Error(`Invalid child protocol: ${line.slice(0, 200)}`);
        }
      }
    }
    notify?.();
  });
  watcherProcess.once('error', (error) => {
    exited = error;
    notify?.();
  });
  watcherProcess.once('exit', (code) => {
    exited = new Error(`watch child exited: ${code}`);
    notify?.();
  });
  return {
    async waitFor(predicate: (capture: Capture) => boolean, label: string): Promise<Capture> {
      const deadline = Date.now() + 30_000;
      let latest: Capture | undefined;
      while (true) {
        while (events.length) {
          latest = events.shift()!;
          if (predicate(latest)) return latest;
        }
        if (exited || Date.now() >= deadline) {
          throw new Error(
            `${label}: ${exited?.message ?? 'timed out'}; outputs=${latest?.files.map((f) => f.path).join(',')}\n${stderr}`,
          );
        }
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, Math.max(1, deadline - Date.now()));
          notify = () => {
            clearTimeout(timer);
            resolve();
          };
        });
        notify = undefined;
      }
    },
    async dispose(): Promise<void> {
      if (watcherProcess.exitCode !== null || watcherProcess.signalCode !== null) return;
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => watcherProcess.kill('SIGKILL'), 2000);
        watcherProcess.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        watcherProcess.kill('SIGTERM');
      });
    },
  };
}

function evidence(name: string, capture: Capture): void {
  const directory = process.env['NGDOC_CAPTURE_DIRECTORY'];
  if (directory) {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, name + '.json'), JSON.stringify(capture, null, 2) + '\n');
  }
}

function byPath(capture: Capture): Map<string, CapturedFile> {
  return new Map(capture.files.map((file) => [file.path, file]));
}

describe('modernization legacy generator fixture (real filesystem, generator-only)', () => {
  let root: string;
  let outDir: string;

  beforeEach(() => {
    // macOS may spell the same temporary directory as /var and /private/var.
    // The legacy watcher filters native events by string prefix, so use its
    // canonical spelling for fixture paths and context.workspaceRoot.
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-modernization.')));
    outDir = path.join(root, 'generated', 'ng-doc', 'fixture');
    fixture(root);
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  // These tests run the legacy build synchronously (`run`, up to 14 s per child). A synchronous
  // test cannot be interrupted, so its limit (90 s) covers all of its runs.
  it('captures guide tabs, category navigation, keywords, API, demo and playground artifacts', () => {
    const capture = run(root, outDir);
    evidence('cold-artifacts', capture);
    const output = byPath(capture);

    expect([...output.keys()]).toEqual(
      expect.arrayContaining([
        'routes.ts',
        'context.ts',
        'assets/indexes.json',
        'assets/keywords.json',
        'guides/guide/index/page.ts',
        'guides/guide/second/page.ts',
        'guides/guide/page.ts',
        'guides/guide/playgrounds.ts',
        'guides/guide/demo-assets.ts',
        'api/page.ts',
      ]),
    );
    expect(capture.diagnostics).toEqual([]);
    expect(output.get('assets/keywords.json')!.normalized).toContain('FixtureKeyword');
    expect(output.get('guides/guide/index/page.ts')!.normalized).toContain('Fixture heading');
    expect(output.get('guides/guide/second/page.ts')!.normalized).toContain('Second heading');
    expect(output.get('guides/guide/demo-assets.ts')!.normalized).toContain('FixtureDemoComponent');
    expect(output.get('guides/guide/demo-assets.ts')!.normalized).toContain('fixture demo');
    expect(output.get('guides/guide/playgrounds.ts')!.normalized).toContain('FixturePlayground');
    expect(output.get('guides/guide/playgrounds.ts')!.normalized).toContain('label');
    // The generated playground classes use the signal contract of NgDocBasePlayground.
    expect(output.get('guides/guide/playgrounds.ts')!.normalized).toContain(
      `[label]="properties()['label']"`,
    );
    expect(output.get('guides/guide/playgrounds.ts')!.normalized).toContain(
      "readonly playground = viewChild(pageEntity.playgrounds['FixturePlayground'].target);",
    );
    expect(output.get('guides/guide/playgrounds.ts')!.normalized).not.toContain('@ViewChild');
    // The page route keeps identical playgrounds of two pages apart (NG0912).
    expect(output.get('guides/guide/playgrounds.ts')!.normalized).toMatch(
      /host: \{'data-ng-doc-playground-page': '[\w/-]*guide'\},\n/,
    );
    expect(output.get('assets/api-list.json')!.normalized).toContain('FixtureApi');
    expect(output.get('assets/api-list.json')!.normalized).toContain('fixtureFn');
    expect(output.get('routes.ts')!.normalized).toContain("path: 'fixture'");
  }, 90_000);

  it('records the current no-op, update, create and delete filesystem distinctions', () => {
    const initial = run(root, outDir);
    const noOp = run(root, outDir);
    const initialByPath = byPath(initial);

    // Legacy build clears the output root when cache is disabled: this is an
    // observed baseline defect/behavior, deliberately asserted rather than hidden.
    expect(noOp.files.some((file) => initialByPath.get(file.path)?.mtimeMs !== file.mtimeMs)).toBe(
      true,
    );

    write(root, 'docs/guide/index.md', '# Fixture heading\n\nChanged body.\n');
    const updated = run(root, outDir);
    expect(byPath(updated).get('guides/guide/index/page.ts')!.normalized).toContain('Changed body');

    write(
      root,
      'docs/created/ng-doc.page.ts',
      `import { NgDocPage } from '@ng-doc/core';\nconst page: NgDocPage = { title: 'Created', route: 'created', mdFile: './index.md' };\nexport default page;\n`,
    );
    write(root, 'docs/created/index.md', '# Created\n');
    const created = run(root, outDir);
    expect(byPath(created).has('guides/created/page.ts')).toBe(true);

    fs.rmSync(path.join(root, 'docs/created'), { recursive: true, force: true });
    const deleted = run(root, outDir);
    expect(byPath(deleted).has('guides/created/page.ts')).toBe(false);
  }, 90_000);

  it('captures routes as semantic data without normalizing their legacy ordering', () => {
    const first = run(root, outDir);
    const second = run(root, outDir);
    const firstRoutes = byPath(first).get('routes.ts')!;
    const secondRoutes = byPath(second).get('routes.ts')!;
    const selectors = (capture: Capture) =>
      capture.files
        .flatMap((file) =>
          [...file.normalized.matchAll(/selector:\s*'([^']+)'/g)].map(
            (match) => `${file.path}:${match[1]}`,
          ),
        )
        .sort();
    expect(selectors(first).length).toBeGreaterThan(4);
    expect(selectors(second)).toEqual(selectors(first));

    expect(firstRoutes.normalized).toContain("path: 'guide'");
    expect(secondRoutes.normalized).toContain("path: 'guide'");
    expect(firstRoutes.normalized).toContain("path: 'api'");
    expect(secondRoutes.normalized).toContain("path: 'api'");
  }, 90_000);
});

describe('modernization legacy native watcher characterization', () => {
  let root: string;
  let outDir: string;
  let observed: ReturnType<typeof watch> | undefined;
  let updated: Capture;
  let demoUpdated: Capture;
  let created: Capture;
  let deleted: Capture;

  beforeAll(async () => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-modernization.')));
    outDir = path.join(root, 'generated', 'ng-doc', 'fixture');
    fixture(root);
    observed = watch(root, outDir);
    await observed.waitFor((c) => !c.nativeEvents, 'initial ready');
    write(root, 'docs/api-added.ts', 'export class AddedByGlob { value = 1; }');
    await observed.waitFor(
      (c) => !!c.nativeEvents?.some((event) => event.path === path.join(root, 'docs/api-added.ts')),
      'native API glob member create',
    );
    write(root, 'docs/guide/index.md', '# Fixture heading\n\nWatcher update.\n');
    const native = await observed.waitFor(
      (c) => !!c.nativeEvents?.some((e) => e.path === path.join(root, 'docs/guide/index.md')),
      'native markdown event',
    );
    if (
      native.nativeEvents!.find((e) => e.path === path.join(root, 'docs/guide/index.md'))!.type ===
      'create'
    ) {
      // FSEvents can coalesce fixture birth with its first edit. The legacy
      // Markdown trigger ignores create; retain that observation and edit again.
      write(
        root,
        'docs/guide/index.md',
        '# Fixture heading\n\nWatcher update. Confirmed update.\n',
      );
    }
    updated = await observed.waitFor(
      (c) => !!byPath(c).get('guides/guide/index/page.ts')?.normalized.includes('Watcher update'),
      'markdown update',
    );
    write(root, 'docs/guide/demo.component.html', '<p>External demo resource updated</p>');
    demoUpdated = await observed.waitFor(
      (c) =>
        !!byPath(c)
          .get('guides/guide/demo-assets.ts')
          ?.normalized.includes('External demo resource updated'),
      'external demo HTML update',
    );
    write(root, 'docs/watched/index.md', '# Watched\n');
    write(
      root,
      'docs/watched/ng-doc.page.ts',
      `import { NgDocPage } from '@ng-doc/core';\nconst page: NgDocPage = { title: 'Watched', route: 'watched', mdFile: './index.md' };\nexport default page;\n`,
    );
    created = await observed.waitFor(
      (c) =>
        byPath(c).has('guides/watched/index/page.ts') &&
        !!byPath(c).get('routes.ts')?.normalized.includes("path: 'watched'"),
      'entry create',
    );
    fs.rmSync(path.join(root, 'docs/watched'), { recursive: true, force: true });
    deleted = await observed.waitFor(
      (c) => !byPath(c).get('routes.ts')?.normalized.includes("path: 'watched'"),
      'entry delete routes',
    );
  }, 120_000);

  afterAll(async () => {
    await observed?.dispose();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });

  it('updates Markdown, adds entry output, and removes deleted routes using real native events', () => {
    expect(byPath(updated).get('guides/guide/index/page.ts')!.normalized).toContain(
      'Watcher update',
    );
    expect(byPath(demoUpdated).get('guides/guide/demo-assets.ts')!.normalized).toContain(
      'External demo resource updated',
    );
    expect(byPath(created).has('guides/watched/index/page.ts')).toBe(true);
    expect(byPath(deleted).get('routes.ts')!.normalized).not.toContain("path: 'watched'");
    expect(deleted.diagnostics).toEqual([]);
    evidence('native-updated-artifacts', updated);
    evidence('native-deleted-artifacts', deleted);
  });

  it.fails(
    'known legacy defect: created API glob member is discovered without editing API entry',
    () => {
      // Native create acknowledged in beforeAll, followed by completed Markdown and demo generations.
      expect(byPath(deleted).get('assets/api-list.json')!.normalized).toContain('AddedByGlob');
    },
  );

  it.fails('desired invariant: deleted entry removes its owned physical content', () => {
    // Explicit expected failure against the legacy engine; the new generator satisfies it.
    // Async setup failures fail beforeAll, so they cannot satisfy this regression.
    expect(byPath(deleted).has('guides/watched/index/page.ts')).toBe(false);
  });
});

describe('real filesystem cache parity', () => {
  let root: string;
  let cold: Capture;
  let warm: Capture;
  beforeAll(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ng-doc-cache-parity.')));
    fixture(root);
    const outDir = path.join(root, 'generated', 'ng-doc', 'fixture');
    cold = run(root, outDir, true);
    warm = run(root, outDir, true);
    evidence('cache-cold', cold);
    evidence('cache-warm', warm);
  }, 100_000);
  afterAll(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
  });
  it('preserves keywords, API list and both declarations from one source', () => {
    const first = byPath(cold);
    const second = byPath(warm);
    for (const file of ['assets/keywords.json', 'assets/api-list.json']) {
      expect(JSON.parse(second.get(file)!.normalized)).toEqual(
        JSON.parse(first.get(file)!.normalized),
      );
    }
    const apiPages = cold.files.filter(
      (file) => file.path.startsWith('api/') && file.path.endsWith('/page.ts'),
    );
    expect(apiPages.length).toBeGreaterThan(2);
    for (const file of apiPages) expect(second.get(file.path)!.normalized).toBe(file.normalized);
  });
  it.fails(
    'known legacy defect: warm cache restores complete search records through artifact application',
    () => {
      // Setup already completed successfully: timeouts cannot satisfy this known defect.
      const first = JSON.parse(byPath(cold).get('assets/indexes.json')!.normalized);
      expect(first.length).toBeGreaterThan(0);
      expect(JSON.parse(byPath(warm).get('assets/indexes.json')!.normalized)).toEqual(first);
    },
  );
});
