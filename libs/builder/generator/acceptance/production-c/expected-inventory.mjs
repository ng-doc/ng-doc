import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import matter from 'gray-matter';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const urlPath = (...parts) =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .join('/')}`;

/** Input-side inventory: no compiler, output assembler, generated routes, or heavy rendering. */
export async function discoverExpectedRoutes(generatorRoot, generatorOptions) {
  const [{ createDiscoveryServices }, { createSemanticService }] = await Promise.all([
    import(pathToFileURL(path.join(generatorRoot, 'discovery/index.js')).href),
    import(pathToFileURL(path.join(generatorRoot, 'semantic/semantic-service.js')).href),
  ]);
  const discovery = createDiscoveryServices(generatorOptions.discovery);
  let semantic;
  let failure;
  let inventory;
  let disposalErrors = [];
  const diagnostics = [];
  const routes = [];
  const excluded = [];
  const scopes = [];
  const sourceFiles = new Map();
  const accept = (result, label) => {
    diagnostics.push(...result.diagnostics);
    const errors = result.diagnostics.filter((item) => item.severity === 'error');
    if (errors.length || result.value === undefined) {
      const error = new Error(
        `Expected inventory ${label} failed: ${errors.map((item) => `[${item.code}] ${item.message}`).join('; ') || 'no value'}`,
      );
      error.diagnostics = [...diagnostics];
      throw error;
    }
    return result.value;
  };
  const add = (route) => {
    const segments = route.path.split('/');
    if (segments.some((segment) => segment.startsWith(':') || segment.includes('*'))) {
      excluded.push({ ...route, reason: 'non-concrete-route' });
      return;
    }
    if (
      segments.some((segment) => segment === '.' || segment === '..') ||
      /[?#\\]/.test(route.path)
    )
      throw new Error(`Unsupported expected route syntax: ${route.path}`);
    const previous = routes.find((item) => item.path === route.path);
    if (previous)
      throw new Error(
        `Expected route collision: ${route.path} (${previous.identity}, ${route.identity})`,
      );
    routes.push(route);
  };
  try {
    semantic = createSemanticService({
      dependencyMode: 'scope-reference',
      ...(generatorOptions.templateRoot ? { templateRoot: generatorOptions.templateRoot } : {}),
      readGuideValues: discovery.values.readGuideValues.bind(discovery.values),
    });
    const signal = new AbortController().signal;
    const found = accept(
      await discovery.discovery.discover(
        {
          generation: 1,
          projectId: generatorOptions.projectId,
          workspaceRoot: generatorOptions.workspaceRoot,
          defaults: generatorOptions.defaults,
          ...(generatorOptions.configFile ? { configFile: generatorOptions.configFile } : {}),
          changes: [],
        },
        signal,
      ),
      'discovery',
    );
    accept(
      await semantic.synchronize({ generation: 1, discovery: found, changes: [] }, signal),
      'semantic synchronize',
    );
    for (const entry of found.entries) {
      const base = {
        identity: entry.id,
        entryId: entry.id,
        title: entry.title,
        source: entry.source.path,
      };
      sourceFiles.set(entry.source.path, hash(await readFile(entry.source.path)));
      if (entry.kind === 'category') {
        excluded.push({
          ...base,
          kind: 'category',
          path: urlPath(entry.absoluteRoute),
          reason: 'category-container-or-redirect',
        });
      } else if (entry.kind === 'guide') {
        const tabs = [];
        for (const file of entry.markdown) {
          let source;
          try {
            source = await readFile(file, 'utf8');
          } catch (cause) {
            throw new Error(`Expected inventory CONTENT_READ: ${file}`, { cause });
          }
          sourceFiles.set(file, hash(source));
          let parsed;
          try {
            parsed = matter(source);
          } catch (cause) {
            throw new Error(`Expected inventory CONTENT_FRONTMATTER: ${file}`, { cause });
          }
          const route = typeof parsed.data.route === 'string' ? parsed.data.route : '';
          tabs.push({
            identity: `${entry.id}:markdown:${file}`,
            source: file,
            route,
            title: typeof parsed.data.title === 'string' ? parsed.data.title : entry.title,
            path: urlPath(entry.absoluteRoute, route),
          });
        }
        if (!tabs.length) throw new Error(`Expected inventory guide has no Markdown: ${entry.id}`);
        const defaultTabs = tabs.filter((tab) => tab.path === urlPath(entry.absoluteRoute));
        if (defaultTabs.length > 1)
          throw new Error(`Expected route collision: multiple default tabs for ${entry.id}`);
        // The wrapper itself is a concrete component URL; its empty-path tab shares that URL.
        add({
          ...base,
          kind: 'guide',
          path: urlPath(entry.absoluteRoute),
          ...(defaultTabs.length ? { defaultTab: defaultTabs[0] } : {}),
        });
        for (const tab of tabs.filter((item) => item.path !== urlPath(entry.absoluteRoute)))
          add({ ...tab, entryId: entry.id, kind: 'guide-tab' });
      } else if (entry.kind === 'api') {
        add({ ...base, kind: 'api-list', path: urlPath(entry.absoluteRoute) });
        const declarations = accept(semantic.enumerateApi(entry.id), `API ${entry.id}`);
        for (const scope of entry.scopes)
          scopes.push({
            entryId: entry.id,
            ...scope,
            declarationIds: declarations
              .filter((item) => item.scopeId === scope.id)
              .map((item) => item.id)
              .sort(),
          });
        for (const declaration of declarations) {
          sourceFiles.set(declaration.source.path, hash(await readFile(declaration.source.path)));
          // Semantic routes already contain routePrefix and intentionally do not inherit API category paths.
          add({
            kind: 'api-declaration',
            identity: declaration.id,
            entryId: entry.id,
            scopeId: declaration.scopeId,
            title: declaration.name,
            declarationKind: declaration.kind,
            source: declaration.source.path,
            path: urlPath(declaration.route),
          });
        }
      } else throw new Error(`Unsupported discovered entry kind: ${entry.kind}`);
    }
    inventory = {
      schemaVersion: 1,
      scope: 'ng-doc-content-routes',
      projectId: found.configuration.projectId,
      routePrefix: found.configuration.routePrefix,
      configurationDigest: found.configuration.digest,
      pathsIncludeRoutePrefix: true,
      routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
      excluded: excluded.sort((a, b) => a.path.localeCompare(b.path)),
      scopes,
      diagnostics,
      sourceFiles: Object.fromEntries([...sourceFiles].sort(([a], [b]) => a.localeCompare(b))),
      policies: {
        applicationRoutes: 'Outside this input inventory; reconcile separately with Router.config.',
        api: 'Actual semantic public supported declarations; scope include/exclude and info diagnostics retained. Internal declarations are excluded by semantic enumeration.',
        prefix:
          'Paths include configured routePrefix; host must mount generated routes there. Deployment base href is separate.',
        defaultTab:
          'Represented on the guide wrapper record at the same concrete URL, never counted twice.',
      },
    };
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const settled = await Promise.allSettled([
      Promise.resolve().then(() => semantic?.dispose()),
      Promise.resolve().then(() => discovery.discovery.dispose()),
    ]);
    disposalErrors = settled
      .filter((item) => item.status === 'rejected')
      .map((item) => item.reason);
    if (disposalErrors.length && failure) failure.cleanupErrors = disposalErrors.map(String);
  }
  // Reached only without a failure: a disposal error then fails the inventory itself.
  if (disposalErrors.length)
    throw new AggregateError(disposalErrors, 'Expected inventory disposal failed');
  return inventory;
}
