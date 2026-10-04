import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, Signal, signal } from '@angular/core';
import { Route, Router } from '@angular/router';
import { NG_DOC_CONTEXT } from '@ng-doc/app/tokens';
import type { NgDocApiList } from '@ng-doc/core/interfaces';
import { NG_REQUEST_BASE_PATH } from '@ng-doc/ui-kit/tokens';
import { firstValueFrom } from 'rxjs';

/**
 * A declaration of an API list, with the scope it belongs to.
 */
export interface NgDocApiListDeclaration {
  /** The name of the declaration. */
  name: string;
  /** The kind of the declaration, for example Class or Function. */
  kind: string;
  /** The scope of the declaration, for example the package name. */
  scope: string;
  /** The route of the declaration page, without the leading slash. */
  route: string;
  /** A one-line description, when the API list data carries one. */
  description?: string;
  /** The declaration header, when the API list data carries it. */
  signature?: string;
}

/**
 * The route data key that names the segment of an API entry's list data
 * (assets/ng-doc/SEGMENT/api-list.json). An empty string is the root list.
 */
export const NG_DOC_API_LIST_SEGMENT_DATA: string = 'ngDocApiListSegment';

/** Route folders of API declaration pages. */
const DECLARATION_ROUTE =
  /^(.*?)\/(classes|interfaces|functions|type-aliases|variables|enums)\/[^/]+\/[^/]+$/;

/**
 * Loads the API lists of every API entry once, for the search palette. The data file of an entry
 * is assets/ng-doc/SEGMENT/api-list.json, where the segment is the route of the entry in its API
 * configuration, or the root when it has none.
 *
 * The new engine lists every segment in the generated context (`NgDocContext.apiLists`), so
 * exactly those files are requested, and none when the site has no API entry. Otherwise the
 * entries are found in the router configuration: a route that carries the route data key
 * NG_DOC_API_LIST_SEGMENT_DATA names its segment, and a route that declaration pages live under
 * (ENTRY/classes/SCOPE/NAME and so on) tries its last route segment, with the root as the
 * fallback ("api" tries the root first, as that is the default route of an API entry). When the
 * configuration shows no entry (lazy routes), the root list is loaded. A list that cannot be
 * loaded is skipped quietly, and each file is requested at most once per application.
 */
@Service()
export class NgDocApiListIndexService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly basePath = inject(NG_REQUEST_BASE_PATH);
  private readonly context = inject(NG_DOC_CONTEXT, { optional: true });
  private readonly lists = signal<ReadonlyMap<string, NgDocApiList[]>>(new Map());
  private readonly requests = new Map<string, Promise<NgDocApiList[] | undefined>>();
  private loading?: Promise<void>;

  /** Every declaration of the loaded API lists. */
  readonly declarations: Signal<NgDocApiListDeclaration[]> = computed(() =>
    [...this.lists().values()].flatMap((lists: NgDocApiList[]) =>
      lists.flatMap((scope: NgDocApiList) =>
        scope.items.map((item) => ({
          name: item.name,
          kind: item.type,
          scope: scope.title,
          route: item.route.replace(/^\/+/, ''),
          description: item.description,
          signature: item.signature,
        })),
      ),
    ),
  );

  /**
   * Starts loading the API lists of every API entry, once.
   * @returns A promise that settles when every list has loaded or failed.
   */
  load(): Promise<void> {
    const generated: readonly string[] | undefined = this.context?.apiLists;
    const entries: ApiEntry[] = generated
      ? generated.map((segment: string) => ({ segments: [segment] }))
      : apiEntries(this.router.config);

    // Generated sites load their pages with lazy routes, which the router configuration does
    // not list until they are loaded. Without the generated list, the root list is where the
    // default API entry keeps its data, so it is tried when no entry is found.
    this.loading ??= Promise.all(
      (entries.length || generated ? entries : [{ segments: [''] }]).map((entry: ApiEntry) =>
        this.loadEntry(entry),
      ),
    ).then(() => undefined);

    return this.loading;
  }

  /**
   * Records an API list that is already loaded (the API index page loads its own), so the
   * palette does not request it again.
   * @param segment - The segment of the list data, or an empty string for the root list.
   * @param list - The list.
   */
  remember(segment: string, list: NgDocApiList[]): void {
    this.requests.set(segment, Promise.resolve(list));
    this.store(segment, list);
  }

  private async loadEntry(entry: ApiEntry): Promise<void> {
    for (const segment of entry.segments) {
      const list = await this.request(segment);

      if (list) {
        this.store(segment, list);

        return;
      }
    }
  }

  private request(segment: string): Promise<NgDocApiList[] | undefined> {
    let request = this.requests.get(segment);

    if (!request) {
      const url = `${this.basePath}assets/ng-doc/${segment ? `${segment}/` : ''}api-list.json`;

      request = firstValueFrom(this.http.get<NgDocApiList[]>(url)).then(
        (list: NgDocApiList[]) => (Array.isArray(list) ? list : undefined),
        () => undefined,
      );
      this.requests.set(segment, request);
    }

    return request;
  }

  private store(segment: string, list: NgDocApiList[]): void {
    this.lists.update((lists: ReadonlyMap<string, NgDocApiList[]>) =>
      new Map(lists).set(segment, list),
    );
  }
}

interface ApiEntry {
  segments: string[];
}

/**
 * Finds the API entries in a router configuration.
 * @param routes - The routes.
 */
function apiEntries(routes: Route[]): ApiEntry[] {
  const entries = new Map<string, ApiEntry>();
  const entryRoutes = new Map<string, Route>();

  const visit = (children: Route[], prefix: string) => {
    for (const route of children) {
      const path = [prefix, route.path ?? ''].filter(Boolean).join('/');

      entryRoutes.set(path, route);
      if (route.children) {
        visit(route.children, path);
      }
    }
  };

  visit(routes, '');

  // A route with the segment in its data is an entry, even while its pages are lazy.
  for (const [path, route] of entryRoutes) {
    const configured = route.data?.[NG_DOC_API_LIST_SEGMENT_DATA];

    if (typeof configured === 'string') {
      entries.set(path, { segments: [configured] });
    }
  }

  for (const path of entryRoutes.keys()) {
    const match = DECLARATION_ROUTE.exec(path);

    if (!match || entries.has(match[1])) {
      continue;
    }

    const last = match[1].split('/').pop() ?? '';

    entries.set(match[1], { segments: last === 'api' ? ['', last] : [last, ''] });
  }

  return [...entries.values()];
}
