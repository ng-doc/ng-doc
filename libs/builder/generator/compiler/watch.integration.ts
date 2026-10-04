import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';

import { createOutputCommitter } from '../artifacts';
import type { BuildEvent, BuildResult, PageArtifact } from '../contracts';
import { hostPath } from '../kernel/paths';
import { createBuildSession } from '../session/build-session';
import { createParcelEventSource } from '../session/parcel-event-source';
import { createCompilationService } from './index';

type SuccessfulBuild = Extract<BuildResult, { status: 'success' }>;

test('native Parcel events drive the real compiler and transactional output lifecycle', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'ng-doc-native-watch-'));
  const docs = path.join(root, 'docs');
  const outputRoot = path.join(root, 'generated', 'ng-doc', 'native-watch');
  const cacheRoot = path.join(root, 'cache');
  const guideRoot = path.join(docs, 'guide');
  const shared = path.join(guideRoot, 'shared.nunj');
  const apiAdded = path.join(docs, 'api-added.ts');
  const apiRenamed = path.join(docs, 'api-renamed.ts');
  const guideDescription = path.join(guideRoot, 'ng-doc.page.ts');
  let session: ReturnType<typeof createBuildSession> | undefined;
  let watch: Awaited<ReturnType<ReturnType<typeof createBuildSession>['watch']>> | undefined;

  try {
    await mkdir(guideRoot, { recursive: true });
    const tsConfig = path.join(root, 'tsconfig.json');
    const configFile = path.join(root, 'ng-doc.config.ts');
    await writeFile(
      tsConfig,
      JSON.stringify({
        compilerOptions: { target: 'ES2022', types: [], skipLibCheck: true },
        include: ['docs/**/*.ts'],
      }),
    );
    await writeFile(
      configFile,
      `export default { docsPath: 'docs', outDir: 'generated', cache: false };`,
    );
    await writeFile(
      path.join(docs, 'ng-doc.category.ts'),
      `/** Parent category. */ const Parent = { title: 'Parent', route: 'parent' }; export default Parent;`,
    );
    await writeFile(
      path.join(docs, 'ng-doc.api.ts'),
      `const Api = { title: 'API', scopes: [{ name: 'Public', route: 'public', include: ['docs/api*.ts'] }] }; export default Api;`,
    );
    await writeFile(path.join(docs, 'api.ts'), `/** Initial API. */ export class InitialApi {}`);
    await writeFile(
      guideDescription,
      `import Parent from '../ng-doc.category'; const Guide = { title: 'Guide', route: 'guide', category: Parent, mdFile: ['./first.md.nunj', './second.md.nunj'] }; export default Guide;`,
    );
    await writeFile(
      path.join(guideRoot, 'first.md.nunj'),
      `---\ntitle: First tab\nroute: first\n---\n# First\n{% include './shared.nunj' %}`,
    );
    await writeFile(
      path.join(guideRoot, 'second.md.nunj'),
      `---\ntitle: Second tab\nroute: second\n---\n# Second\n{% include './shared.nunj' %}`,
    );
    await writeFile(shared, 'Shared version one with `AddedApi`.');

    const compiler = createCompilationService({
      projectId: 'native-watch',
      workspaceRoot: root,
      configFile,
      defaults: { docsRoot: docs, tsConfig, outputRoot, cacheRoot },
      compilerVersion: 'native-watch-v1',
      toolchainDigest: 'native-watch-toolchain',
    });
    const committer = createOutputCommitter({ outputRoot });
    session = createBuildSession({ compiler, committer }, { batchDelayMs: 20 });
    const events: BuildEvent[] = [];
    const results: BuildResult[] = [];
    const waiters = new Set<{
      predicate: (result: BuildResult) => boolean;
      resolve: (result: BuildResult) => void;
    }>();
    const observe = (event: BuildEvent): void => {
      events.push(event);
      if (event.kind !== 'result') return;
      results.push(event.result);
      for (const waiter of [...waiters]) {
        if (waiter.predicate(event.result)) {
          waiters.delete(waiter);
          waiter.resolve(event.result);
        }
      }
    };
    // The session reports changes in the engine's spelling (forward slashes on Windows too).
    const changes = (): Array<{ kind: string; path: string }> =>
      events.flatMap((event) => (event.kind === 'started' ? event.changes : []));
    const waitFor = async (
      afterGeneration: number,
      predicate: (result: BuildResult) => boolean,
    ): Promise<BuildResult> => {
      const existing = results.find(
        (result) => result.generation > afterGeneration && predicate(result),
      );
      if (existing) return existing;
      return await new Promise<BuildResult>((resolve, reject) => {
        const waiter = {
          predicate: (result: BuildResult) =>
            result.generation > afterGeneration && predicate(result),
          resolve: (result: BuildResult) => {
            clearTimeout(deadline);
            resolve(result);
          },
        };
        const deadline = setTimeout(() => {
          waiters.delete(waiter);
          reject(
            new Error(
              `Timed out after generation ${afterGeneration}; observed ${results
                .map((result) => `${result.generation}:${result.status}`)
                .join(', ')}`,
            ),
          );
        }, 30_000);
        waiters.add(waiter);
      });
    };
    const next = async (
      previous: BuildResult,
      mutate: () => Promise<unknown>,
      predicate: (result: BuildResult) => boolean,
    ): Promise<BuildResult> => {
      const pending = waitFor(previous.generation, predicate);
      await mutate();
      return await pending;
    };
    const successful = (result: BuildResult): SuccessfulBuild => {
      if (result.status !== 'success') {
        throw new Error(
          `Expected success, got ${result.status}: ${JSON.stringify(result.diagnostics, null, 2)}`,
        );
      }
      expect(result.diagnostics.filter((item) => item.severity === 'error')).toEqual([]);
      return result;
    };
    const guideArtifact = (result: SuccessfulBuild): PageArtifact => {
      const artifact = result.snapshot.artifacts.find(
        (item) => item.content.filter((content) => content.ir.role === 'guide-tab').length === 2,
      );
      expect(artifact).toBeDefined();
      return artifact!;
    };
    const hasApi = (result: BuildResult, name: string): boolean =>
      result.status === 'success' &&
      result.snapshot.artifacts
        .flatMap((artifact) => artifact.apiList)
        .some((api) => api.name === name);
    const hasGuideText = (result: BuildResult, text: string): boolean => {
      if (result.status !== 'success') return false;
      const tabs = result.snapshot.artifacts
        .flatMap((artifact) => artifact.content)
        .filter((content) => content.ir.role === 'guide-tab');
      return tabs.length === 2 && tabs.every((content) => content.html.includes(text));
    };

    const source = createParcelEventSource(root, {
      ignore: [outputRoot, cacheRoot, '**/node_modules/**'],
    });
    watch = await session.watch(source, observe);
    const initial = await watch.initial;
    let current = successful(
      initial.status === 'success'
        ? initial
        : await waitFor(initial.generation, (result) => result.status === 'success'),
    );
    expect(
      guideArtifact(current).content.filter((item) => item.ir.role === 'guide-tab'),
    ).toHaveLength(2);
    expect(
      guideArtifact(current)
        .content.filter((item) => item.ir.role === 'guide-tab')
        .every((item) => item.html.includes('Shared version one')),
    ).toBe(true);
    await expect(
      access(path.join(outputRoot, '.ng-doc-output-manifest.json')),
    ).resolves.toBeUndefined();

    current = successful(
      await next(
        current,
        () => writeFile(shared, 'Shared version two with `AddedApi`.'),
        (result) => hasGuideText(result, 'Shared version two'),
      ),
    );
    expect(
      changes().some(
        (change) => change.path === hostPath(shared) && ['create', 'update'].includes(change.kind),
      ),
    ).toBe(true);

    current = successful(
      await next(
        current,
        () => writeFile(apiAdded, '/** Added from a native create. */ export class AddedApi {}'),
        (result) => hasApi(result, 'AddedApi'),
      ),
    );
    expect(changes()).toContainEqual(
      expect.objectContaining({ kind: 'create', path: hostPath(apiAdded) }),
    );
    expect(
      guideArtifact(current).content.some(
        (item) => item.html.includes('AddedApi') && item.html.includes('<a'),
      ),
    ).toBe(true);

    const addedOwner = current.snapshot.artifacts.find((artifact) =>
      artifact.apiList.some((api) => api.name === 'AddedApi'),
    )!.id;
    current = successful(
      await next(
        current,
        () => rename(apiAdded, apiRenamed),
        (result) =>
          hasApi(result, 'AddedApi') &&
          changes().some(
            (change) => change.kind === 'delete' && change.path === hostPath(apiAdded),
          ) &&
          changes().some(
            (change) => change.kind === 'create' && change.path === hostPath(apiRenamed),
          ),
      ),
    );
    expect(current.whyRebuilt.some((reason) => reason.ownerId === addedOwner)).toBe(true);

    current = successful(
      await next(
        current,
        () => rm(apiRenamed),
        (result) => result.status === 'success' && !hasApi(result, 'AddedApi'),
      ),
    );
    expect(changes()).toContainEqual(
      expect.objectContaining({ kind: 'delete', path: hostPath(apiRenamed) }),
    );

    const beforeFailureRevision = current.snapshot.revision;
    const stableOutput = path.join(
      outputRoot,
      guideArtifact(current).outputs.find((output) => output.role === 'content')!.path,
    );
    const stableBytes = await readFile(stableOutput);
    const failed = await next(
      current,
      () => rm(shared),
      (result) => result.status === 'failure',
    );
    expect(failed).toMatchObject({ status: 'failure', lastGoodRevision: beforeFailureRevision });
    expect(failed.diagnostics.some((item) => item.severity === 'error')).toBe(true);
    expect(await readFile(stableOutput)).toEqual(stableBytes);

    current = successful(
      await next(
        failed,
        () => writeFile(shared, 'Shared repaired with `AddedApi`.'),
        (result) => hasGuideText(result, 'Shared repaired'),
      ),
    );
    expect(changes()).toContainEqual(
      expect.objectContaining({ kind: 'create', path: hostPath(shared) }),
    );

    const missingOutput = path.join(
      outputRoot,
      guideArtifact(current).outputs.find((output) => output.role === 'content')!.path,
    );
    await rm(missingOutput);
    current = successful(
      await next(
        current,
        () => writeFile(shared, 'Shared version four with `AddedApi`.'),
        (result) =>
          result.status === 'success' &&
          result.whyRebuilt.some(
            (reason) => reason.reason === 'output-missing' && reason.detail.endsWith('.ts'),
          ),
      ),
    );
    await expect(access(missingOutput)).resolves.toBeUndefined();

    const removedGuide = guideArtifact(current);
    const removedOutputs = removedGuide.outputs.map((output) => path.join(outputRoot, output.path));
    current = successful(
      await next(
        current,
        () => rm(guideDescription),
        (result) =>
          result.status === 'success' &&
          !result.snapshot.artifacts.some((artifact) => artifact.id === removedGuide.id),
      ),
    );
    expect(current.whyRebuilt.some((reason) => reason.ownerId === removedGuide.id)).toBe(true);
    for (const output of removedOutputs) await expect(access(output)).rejects.toBeDefined();
    const routesOutput = current.snapshot.artifacts
      .flatMap((artifact) => artifact.outputs)
      .find((output) => output.role === 'routes');
    expect(routesOutput?.content).not.toContain(`title: 'Parent'`);

    await watch.dispose();
    watch = undefined;
    await session.dispose();
    session = undefined;
    await rm(root, { recursive: true });
    await expect(access(root)).rejects.toBeDefined();
  } finally {
    await watch?.dispose().catch(() => undefined);
    await session?.dispose().catch(() => undefined);
    await rm(root, { recursive: true, force: true });
  }
}, 120_000);
