import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { cleanup, expectCold, pageModule, project, save, startHost } from './page-tabs-support';

afterEach(cleanup, 30_000);

describe('structural edits while the Vite/Analog dev host runs', () => {
  // The structural corpus of the host: each edit creates or deletes generated modules (a title edit
  // rewrites them in place). With the structural pass the Angular compiler leaves their add and
  // unlink events to the generation's own pass; without it, each event compiles the program first.
  // Either way every update settles as a cold build.
  it.each([
    ['on', true],
    ['off', false],
  ])(
    'adds, renames, retitles and deletes a page and adds a category with the structural pass %s, each update settling as a cold build',
    async (_label, structuralPass) => {
      vi.stubEnv('NODE_ENV', 'development');
      vi.stubEnv('VITEST', undefined);
      vi.stubEnv('NGDOC_ANGULAR_STRUCTURAL_PASS', structuralPass ? undefined : '0');
      const fixture = await project();
      const host = await startHost(fixture);
      const probe = path.join(fixture.docs, 'probe');
      const moved = path.join(fixture.docs, 'moved');
      // Every change lands at once (a folder moved in, a file renamed over another), as an
      // editor's save does: the host runs in this process, so a pass that holds its thread
      // between two writes of a file would otherwise let a generation read it half written.
      const staging = path.join(fixture.root, 'staging');
      let staged = 0;
      const stage = async (files: Record<string, string>) => {
        const folder = path.join(staging, String(++staged));
        for (const [file, text] of Object.entries(files)) {
          await mkdir(path.dirname(path.join(folder, file)), { recursive: true });
          await writeFile(path.join(folder, file), text);
        }
        return folder;
      };

      const added = await stage({
        'index.md': '# Probe\nProbe body.\n',
        'ng-doc.page.ts': pageModule('Probe', 'probe'),
      });
      await host.edit(() => rename(added, probe));
      expect(await host.served('routes.ts')).toContain("path: 'probe'");
      await expectCold(fixture, host);

      // Renamed: the folder moves, and with it the page's generated modules.
      await host.edit(() => rename(probe, moved));
      expect(await host.served('routes.ts')).toContain('guides/moved/page.ts');
      expect(await host.served('routes.ts')).not.toContain('guides/probe/page.ts');
      await expectCold(fixture, host);

      const retitled = await stage({ 'ng-doc.page.ts': pageModule('Retitled probe', 'probe') });
      await host.edit(() =>
        rename(path.join(retitled, 'ng-doc.page.ts'), path.join(moved, 'ng-doc.page.ts')),
      );
      expect(await host.served('routes.ts')).toContain('Retitled probe');
      await expectCold(fixture, host);

      // A category with a page of its own.
      const section = await stage({
        'ng-doc.category.ts':
          "const category = { title: 'Section', route: 'section' };\nexport default category;\n",
        'inside/index.md': '# Inside\nInside body.\n',
        'inside/ng-doc.page.ts':
          "import Section from '../ng-doc.category';\n" +
          pageModule('Inside', 'inside', ', category: Section'),
      });
      await host.edit(() => rename(section, path.join(fixture.docs, 'section')));
      expect(await host.served('routes.ts')).toContain("path: 'section'");
      await expectCold(fixture, host);

      await host.edit(() => rm(moved, { recursive: true }));
      expect(await host.served('routes.ts')).not.toContain('guides/moved/page.ts');
      await expectCold(fixture, host);
      expect(host.errors()).toEqual([]);
    },
    300_000,
  );

  // VS Code saves in place: the file is truncated, then written. A generation may start on the
  // empty file; chokidar may report the truncation only (its 50 ms change throttle), and the event
  // source's trailing re-stat reports the write. Either way every save settles on its final bytes.
  it('settles in-place saves (truncate, then write) on their final content, as a cold build', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    const host = await startHost(fixture);
    const page = path.join(fixture.docs, 'guide/ng-doc.page.ts');
    const second = path.join(fixture.docs, 'guide/second.md');
    await host.edit(() =>
      save(
        fixture,
        page,
        "const Guide = { title: 'Guide', route: 'guide', mdFile: ['./guide.md', './second.md'] };\nexport default Guide;\n",
      ),
    );
    await expectCold(fixture, host);

    // Prose of the first tab.
    await host.saveInPlace(path.join(fixture.docs, 'guide/guide.md'), '# Guide\nSaved in place.\n');
    await expectCold(fixture, host);

    // The second tab's route: its generated modules move (the empty file would move them too).
    await host.saveInPlace(second, '---\ntitle: Second\nroute: moved-in-place\n---\n\nMoved.\n');
    expect(await host.served('guides/guide/page.ts')).toContain('moved-in-place');
    await expectCold(fixture, host);

    // Two in-place saves back to back, the first of unchanged bytes: the last one wins.
    await writeFile(second, '');
    await writeFile(second, '---\ntitle: Second\nroute: moved-in-place\n---\n\nMoved.\n');
    await host.saveInPlace(second, '---\ntitle: Second\nroute: second-tab\n---\n\nBack.\n');
    expect(await host.served('guides/guide/page.ts')).toContain('second-tab');
    await expectCold(fixture, host);
    expect(host.errors()).toEqual([]);
  }, 300_000);

  it('settles edits of an existing page that was never opened', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITEST', undefined);
    const fixture = await project();
    // Vite has served no generated module: it knows none of them from its module graph.
    const host = await startHost(fixture, { open: false });
    const guide = path.join(fixture.docs, 'guide');

    // Prose: only the page's content module changes.
    await host.edit(() =>
      save(fixture, path.join(guide, 'guide.md'), '# Guide\nEdited, unopened.\n'),
    );
    await expectCold(fixture, host, { served: false });

    // Title: the page shell, routes and context change.
    await host.edit(() =>
      save(
        fixture,
        path.join(guide, 'ng-doc.page.ts'),
        "const Guide = { title: 'Unopened guide', route: 'guide', mdFile: './guide.md' };\nexport default Guide;\n",
      ),
    );
    await expectCold(fixture, host, { served: false });
    expect(await readFile(path.join(fixture.output, 'routes.ts'), 'utf8')).toContain(
      'Unopened guide',
    );
    expect(host.errors()).toEqual([]);
  }, 300_000);
});
