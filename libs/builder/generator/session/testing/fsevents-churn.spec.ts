/** @vitest-environment node */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import type { BuildResult, Diagnostic } from '../../contracts';
import { createBuildSession } from '../build-session';
import { createParcelEventSource } from '../parcel-event-source';
import { filterFileEvents, WatchInputFilter } from '../watch-input-filter';
import { compilation, harness, until } from './support';

/**
 * Real FSEvents reproduction of an Angular CLI host watch crash: heavy unrelated churn in the
 * watched workspace overflows the native queue ("Events were dropped by the FSEvents client"). The
 * watch must keep running, report only a warning and publish the newest edit. Opt-in (about one
 * minute of heavy filesystem load on macOS): NGDOC_FSEVENTS_CHURN=1.
 */
const enabled = process.platform === 'darwin' && process.env['NGDOC_FSEVENTS_CHURN'] === '1';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

const CHURN = `
const { mkdirSync, writeFileSync, renameSync, rmSync } = require('node:fs');
const [dir, count] = [process.argv[1], Number(process.argv[2])];
for (let round = 0; round < 3; round++) {
  const target = dir + '/r' + round;
  mkdirSync(target, { recursive: true });
  for (let index = 0; index < count; index++) {
    writeFileSync(target + '/f' + index + '.txt', String(index));
    renameSync(target + '/f' + index + '.txt', target + '/g' + index + '.txt');
  }
  rmSync(target, { recursive: true, force: true });
}`;

(enabled ? it : it.skip)(
  'survives real FSEvents drops under workspace churn and publishes the newest edit',
  async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'ngdoc-churn-')));
    const h = harness();
    const session = createBuildSession(h.services, { batchDelayMs: 20 });
    try {
      const page = join(root, 'docs/page.md');
      mkdirSync(join(root, 'docs'), { recursive: true });
      writeFileSync(page, 'v0');
      h.compile.mockImplementation(async (request) => {
        const body = readFileSync(page, 'utf8');
        await new Promise((done) => setTimeout(done, 200));
        return {
          ...compilation(`${request.generation}:${body}`),
          dependencies: [{ kind: 'content', path: page, digest: digest(body) }],
        };
      });
      const filter = new WatchInputFilter();
      const diagnostics: Diagnostic[] = [];
      const committed: string[] = [];
      const watch = await session.watch(
        filterFileEvents(createParcelEventSource(root), filter),
        (event) => {
          if (event.kind === 'diagnostic') diagnostics.push(event.diagnostic);
          if (event.kind === 'result') {
            filter.observe(event.result);
            const result: BuildResult = event.result;
            if (result.status === 'success') committed.push(result.snapshot.revision);
          }
        },
      );
      expect(await watch.initial).toMatchObject({ status: 'success' });
      const children = [0, 1, 2, 3, 4, 5].map((index) =>
        spawn(process.execPath, ['-e', CHURN, join(root, `churn-${index}`), '15000'], {
          stdio: 'ignore',
        }),
      );
      const exited = Promise.all(
        children.map((child) => new Promise((done) => child.once('exit', done))),
      );
      // Keep the event loop busy for a while, as a loaded dev server does, then edit repeatedly.
      const busy = Date.now() + 10_000;
      while (Date.now() < busy);
      for (let version = 1; version <= 5; version++) {
        writeFileSync(page, `v${version}`);
        await new Promise((done) => setTimeout(done, 1500));
      }
      await exited;
      await until(() => committed.at(-1)?.endsWith(':v5') === true, 120_000);
      const codes = diagnostics.map((item) => `${item.code}:${item.severity}`);
      // The reproduction is only meaningful if the native queue actually overflowed.
      expect(codes).toContain('WATCHER_RESCAN:warning');
      expect(diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      expect(session.inspect()).toMatchObject({ watching: true, disposed: false });
      // Unrelated churn never reached the session: only the page or its (coalesced) directory.
      expect(
        h.compile.mock.calls
          .flatMap(([request]) => request.changes)
          .filter((change) => change.path !== page && change.path !== join(root, 'docs')),
      ).toEqual([]);
    } finally {
      await session.dispose();
      rmSync(root, { recursive: true, force: true });
    }
  },
  240_000,
);
