import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

// Routes that `onlyForTags` deliberately removes from a build of the new engine.
//
// The legacy engine ignores `onlyForTags`, so baselines recorded with it (or before the new engine
// applied it) contain entries such as the docs site's internal Develop sandbox (`onlyForTags:
// ['development']`), which a production build of the new engine leaves out on purpose. Acceptance
// gates that compare against such a baseline accept exactly those removals, derived here from
// discovery itself rather than hard-coded: discovery runs once with the build's tags and once
// with every tag that any `onlyForTags` names (so nothing tag-filtered is left out), and the
// entries only the second run keeps are the expected removals. Every other missing route still
// fails the gate.

const root = fileURLToPath(new URL('../../../../../', import.meta.url));

/** Bundles discovery from source into a new directory (it is not a package entry point). */
export async function bundleDiscoveryRuntime(outputRoot) {
  const output = path.resolve(outputRoot);
  assert.ok(
    !output.startsWith(path.join(root, 'dist') + path.sep),
    'The discovery runtime must not write shared dist',
  );
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output); // Refuse to reuse an existing directory.
  await writeFile(path.join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(path.join(root, 'node_modules'), path.join(output, 'node_modules'), 'dir');
  await build({
    absWorkingDir: root,
    entryPoints: { 'discovery/index': 'libs/builder/generator/discovery/index.ts' },
    outdir: output,
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
  return path.join(output, 'discovery/index.js');
}

const normalize = (route) =>
  `/${String(route)
    .replace(/\/index\.html$/, '')
    .split('/')
    .filter(Boolean)
    .join('/')}`;

/**
 * Runs discovery with the build's tags and with every tag any `onlyForTags` names.
 * @param {object} input
 * @param {string} input.discoveryModule path of a discovery module exporting createDiscoveryServices
 * @param {object} input.request a DiscoveryRequest without `generation` and `changes`
 * @param {string[]} input.tags the build's tags
 * @param {object} [input.discovery] other DiscoveryOptions of the build
 */
export async function onlyForTagsRemovals({ discoveryModule, request, tags, discovery = {} }) {
  const { createDiscoveryServices } = await import(pathToFileURL(discoveryModule).href);
  const discover = async (withTags) => {
    const services = createDiscoveryServices({ ...discovery, tags: withTags });
    try {
      const result = await services.discovery.discover(
        { generation: 1, changes: [], ...request },
        new AbortController().signal,
      );
      const errors = result.diagnostics.filter((item) => item.severity === 'error');
      assert.ok(
        result.value && !errors.length,
        `onlyForTags discovery failed: ${errors.map((item) => `[${item.code}] ${item.message}`).join('; ')}`,
      );
      return result.value;
    } finally {
      await services.discovery.dispose();
    }
  };
  const built = await discover(tags);
  let widened = [...new Set(tags)].sort();
  let unfiltered = built;
  // A left-out category hides its children's own tags only until it is kept; widen to a fixpoint.
  for (let round = 0; round < 16; round += 1) {
    const named = new Set(widened);
    for (const entry of unfiltered.filtered ?? [])
      for (const tag of [...(entry.onlyForTags ?? []), ...entry.filteredBy.onlyForTags])
        named.add(tag);
    if (named.size === widened.length && unfiltered !== built) break;
    widened = [...named].sort();
    unfiltered = await discover(widened);
  }
  const kept = new Set(built.entries.map((entry) => entry.id));
  const removed = unfiltered.entries
    .filter((entry) => !kept.has(entry.id))
    .map((entry) => ({
      kind: entry.kind,
      title: entry.title,
      source: entry.source.path,
      route: normalize(entry.absoluteRoute),
    }));
  // `onlyForTags: []` is left out under every tag set (the legacy engine shows it).
  const never = (unfiltered.filtered ?? []).map((entry) => ({
    kind: entry.kind,
    title: entry.title,
    source: entry.source,
    route: normalize(entry.absoluteRoute),
  }));
  const entries = [...removed, ...never].sort((left, right) =>
    left.route.localeCompare(right.route),
  );
  // Cross-check: every removal is exactly an entry the build itself reports as left out.
  const reported = new Set((built.filtered ?? []).map((entry) => entry.source));
  for (const entry of entries)
    assert.ok(
      reported.has(entry.source),
      `Removal not reported by the build's discovery: ${entry.source}`,
    );
  const keptRoutes = built.entries.map((entry) => normalize(entry.absoluteRoute));
  return {
    tags: [...tags].sort(),
    widenedTags: widened,
    entries,
    routes: [...new Set(entries.map((entry) => entry.route))],
    keptRoutes,
  };
}

/**
 * Whether a route (`/a/b`, `a/b` or `a/b/index.html`) is removed by `onlyForTags`: the route of a
 * removed entry or one below it (guide tabs, API pages), unless a kept entry owns it more closely.
 */
export function isOnlyForTagsRemoval(removals, route) {
  const value = normalize(route);
  const under = (prefix) => value === prefix || value.startsWith(`${prefix}/`);
  const removedBy = removals.routes.filter(under).sort((a, b) => b.length - a.length)[0];
  if (!removedBy) return false;
  return !removals.keptRoutes.some((kept) => under(kept) && kept.length > removedBy.length);
}

/** Splits missing routes into the expected `onlyForTags` removals and every other loss. */
export function partitionRemovedRoutes(removals, missing) {
  const expected = missing.filter((route) => isOnlyForTagsRemoval(removals, route));
  return { expected, unexpected: missing.filter((route) => !expected.includes(route)) };
}

/** Whether a keyword (`{ path }`, path with an optional `#fragment`) points into a removed route. */
export function isOnlyForTagsKeywordRemoval(removals, keyword) {
  return isOnlyForTagsRemoval(removals, String(keyword?.path ?? '').split(/[#?]/)[0]);
}
