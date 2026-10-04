import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, expectCold, pageModule, project, save, startHost } from './page-tabs-support';

afterEach(cleanup, 30_000);

describe('structural edits while the Vite/Analog dev host runs', () => {
  it('adds, renames and removes a markdown tab, each update settling as a cold build', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    const host = await startHost(fixture);
    const page = path.join(fixture.docs, 'guide/ng-doc.page.ts');
    const tabs = (files: string | string[]) =>
      `const Guide = { title: 'Guide', route: 'guide', mdFile: ${JSON.stringify(files)} };\nexport default Guide;\n`;
    const shell = 'guides/guide/page.ts';

    // Added: the page shell becomes a tab router, and each tab gets a page of its own.
    await host.edit(() => save(fixture, page, tabs(['./guide.md', './second.md'])));
    expect(await host.served(shell)).toContain('second-tab');
    await expectCold(fixture, host);

    // Renamed through its front matter: the tab's route and output directory change.
    await host.edit(() =>
      save(
        fixture,
        path.join(fixture.docs, 'guide/second.md'),
        '---\ntitle: Renamed\nroute: renamed-tab\n---\n\nSecond tab body.\n',
      ),
    );
    expect(await host.served(shell)).toContain('renamed-tab');
    expect(await host.served(shell)).not.toContain('second-tab');
    await expectCold(fixture, host);

    // Renamed in mdFile: another file takes its place.
    await host.edit(() => save(fixture, page, tabs(['./guide.md', './third.md'])));
    expect(await host.served(shell)).toContain('third-tab');
    expect(await host.served(shell)).not.toContain('renamed-tab');
    await expectCold(fixture, host);

    // Removed: back to a single markdown file.
    await host.edit(() => save(fixture, page, tabs('./guide.md')));
    expect(await host.served(shell)).not.toContain('third-tab');
    await expectCold(fixture, host);
    expect(host.errors()).toEqual([]);
  }, 300_000);

  it('adds and removes a page, a category and a demo file, each update settling as a cold build', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    const host = await startHost(fixture);
    const section = path.join(fixture.docs, 'section');
    const probe = path.join(section, 'probe');

    await host.edit(async () => {
      await mkdir(probe, { recursive: true });
      await save(fixture, path.join(probe, 'index.md'), '# Probe\nProbe body.\n');
      await save(fixture, path.join(probe, 'ng-doc.page.ts'), pageModule('Probe', 'probe'));
    });
    expect(await host.served('routes.ts')).toContain("path: 'probe'");
    await expectCold(fixture, host);

    const category = path.join(section, 'ng-doc.category.ts');
    const demo = path.join(probe, 'probe-demo.component.ts');
    const page = path.join(probe, 'ng-doc.page.ts');
    const categoryImport = "import Section from '../ng-doc.category';\n";

    // A category no page belongs to yet: a new TypeScript source that changes no generated module.
    await host.edit(() =>
      save(
        fixture,
        category,
        "const category = { title: 'Section', route: 'section' };\nexport default category;\n",
      ),
    );
    expect(await host.served('routes.ts')).not.toContain("path: 'section'");
    await expectCold(fixture, host);

    // The page joins it and moves below its route.
    await host.edit(() =>
      save(fixture, page, categoryImport + pageModule('Probe', 'probe', ', category: Section')),
    );
    expect(await host.served('routes.ts')).toContain("path: 'section'");
    await expectCold(fixture, host);

    // A demo component no page imports yet, then the page that shows it.
    await host.edit(() =>
      save(
        fixture,
        demo,
        "import { Component } from '@angular/core';\n@Component({ selector: 'probe-demo', template: 'probe demo marker' })\nexport class ProbeDemoComponent {}\n",
      ),
    );
    await expectCold(fixture, host);
    await host.edit(() =>
      save(
        fixture,
        page,
        `${categoryImport}import { ProbeDemoComponent } from './probe-demo.component';\n${pageModule('Probe', 'probe', ', category: Section, demos: { ProbeDemoComponent }')}`,
      ),
    );
    expect(await host.served('guides/section/probe/demo-assets.ts')).toContain(
      'ProbeDemoComponent',
    );
    await expectCold(fixture, host);

    // The demo is removed from the page and deleted.
    await host.edit(async () => {
      await save(
        fixture,
        page,
        categoryImport + pageModule('Probe', 'probe', ', category: Section'),
      );
      await rm(demo);
    });
    await expectCold(fixture, host);

    // The page leaves the category, which is deleted.
    await host.edit(async () => {
      await save(fixture, page, pageModule('Probe', 'probe'));
      await rm(category);
    });
    expect(await host.served('routes.ts')).not.toContain("path: 'section'");
    await expectCold(fixture, host);

    // The page is deleted.
    await host.edit(() => rm(section, { recursive: true }));
    expect(await host.served('routes.ts')).not.toContain("path: 'probe'");
    await expectCold(fixture, host);
    expect(host.errors()).toEqual([]);
  }, 300_000);
});
