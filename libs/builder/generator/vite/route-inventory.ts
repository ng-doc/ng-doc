/** A concrete primary-outlet URL of the application, with its redirect target when it redirects. */
export interface NgDocPrerenderRoute {
  path: string;
  redirectTo?: string;
}

/** A route candidate that has no single concrete URL, and why. */
export interface NgDocExcludedRoute {
  path: string;
  reason:
    | 'cycle'
    | 'function-redirect'
    | 'matcher'
    | 'missing-path'
    | 'non-primary-outlet'
    | 'parameter'
    | 'shadowed'
    | 'wildcard';
}

export interface NgDocRouteInventory {
  routes: NgDocPrerenderRoute[];
  excluded: NgDocExcludedRoute[];
}

interface RouteLike {
  path?: unknown;
  outlet?: unknown;
  matcher?: unknown;
  redirectTo?: unknown;
  children?: unknown;
  loadChildren?: unknown;
  component?: unknown;
  loadComponent?: unknown;
}

/**
 * Enumerates the concrete primary-outlet URLs of an Angular `Router.config`.
 *
 * `invoke` runs a lazy `loadChildren` factory; the caller wraps it in the application's injection
 * context, because a factory may call `inject()`. Parameterized, wildcard, matcher and
 * function-redirect routes have no single URL and are reported as excluded, never guessed.
 */
export async function enumerateRoutes(
  routes: readonly unknown[],
  { invoke }: { invoke: (factory: () => unknown) => unknown },
): Promise<NgDocRouteInventory> {
  if (!Array.isArray(routes)) {
    throw new TypeError('routes must be an Angular Routes array');
  }
  if (typeof invoke !== 'function') {
    throw new TypeError('invoke must be a function');
  }

  const found: NgDocPrerenderRoute[] = [];
  const excluded: NgDocExcludedRoute[] = [];
  const emitted = new Set<string>();

  const addRoute = (path: string, base: string, route: RouteLike): void => {
    const redirectTo =
      typeof route.redirectTo === 'string' ? resolveRedirect(base, route.redirectTo) : undefined;
    const key = `${path}\0${redirectTo ?? ''}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    found.push(redirectTo === undefined ? { path } : { path, redirectTo });
  };

  const exclude = (path: string, reason: NgDocExcludedRoute['reason']): void => {
    excluded.push({ path, reason });
  };

  async function visit(
    siblings: readonly unknown[],
    base: string,
    ancestors: ReadonlySet<readonly unknown[]>,
  ): Promise<void> {
    if (ancestors.has(siblings)) {
      exclude(base, 'cycle');
      return;
    }
    const branch = new Set(ancestors);
    branch.add(siblings);
    const claimedTerminals = new Set<string>();

    for (const candidate of siblings) {
      if (!candidate || typeof candidate !== 'object') continue;
      const route = candidate as RouteLike;
      if (route.outlet && route.outlet !== 'primary') {
        exclude(join(base, typeof route.path === 'string' ? route.path : ''), 'non-primary-outlet');
        continue;
      }
      if (typeof route.path !== 'string') {
        exclude(base, route.matcher ? 'matcher' : 'missing-path');
        continue;
      }
      const path = join(base, route.path);
      if (typeof route.redirectTo === 'function') {
        exclude(path, 'function-redirect');
        continue;
      }
      if (route.path === '**') {
        exclude(path, 'wildcard');
        continue;
      }
      if (route.path.split('/').some((segment) => segment.startsWith(':'))) {
        exclude(path, 'parameter');
        continue;
      }
      if (isTerminal(route)) {
        // Duplicate prefixes are not suppressed: Angular backtracks after a child misses, so the
        // children of every same-path sibling stay reachable. A second terminal at the same URL
        // is only reached after the first one matched, so it is shadowed.
        if (claimedTerminals.has(path)) {
          exclude(path, 'shadowed');
        } else {
          addRoute(path, base, route);
          claimedTerminals.add(path);
        }
      }
      if (Array.isArray(route.children)) {
        await visit(route.children, path, branch);
      }
      if (typeof route.loadChildren === 'function') {
        const factory = route.loadChildren as () => unknown;
        await visit(unwrapLazyRoutes(await invoke(factory)), path, branch);
      }
    }
  }

  await visit(routes, '/', new Set());
  found.sort(
    (left, right) =>
      compareText(left.path, right.path) ||
      compareText(left.redirectTo ?? '', right.redirectTo ?? ''),
  );
  excluded.sort(
    (left, right) => compareText(left.path, right.path) || compareText(left.reason, right.reason),
  );
  return { routes: found, excluded };
}

function isTerminal(route: RouteLike): boolean {
  return typeof route.redirectTo === 'string' || 'component' in route || 'loadComponent' in route;
}

function unwrapLazyRoutes(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof (value as { subscribe?: unknown }).subscribe === 'function') {
    throw new TypeError('loadChildren Observable results are not supported');
  }
  const module = value as { default?: unknown } | undefined;
  if (module && Array.isArray(module.default)) return module.default;
  throw new TypeError(
    'loadChildren must resolve to a Routes array or a module with a default Routes array',
  );
}

function join(base: string, child: string): string {
  const pieces = [base, child].flatMap((part) => part.split('/')).filter(Boolean);
  return `/${pieces.join('/')}`;
}

function resolveRedirect(base: string, redirectTo: string): string {
  return normalize(redirectTo.startsWith('/') ? redirectTo : `${base}/${redirectTo}`);
}

function normalize(path: string): string {
  const pieces: string[] = [];
  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') pieces.pop();
    else pieces.push(segment);
  }
  return `/${pieces.join('/')}`;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
