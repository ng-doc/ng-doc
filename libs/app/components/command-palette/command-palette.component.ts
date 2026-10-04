import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  Signal,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { form, FormField } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { NgDocSearchEngine } from '@ng-doc/app/classes/search-engine';
import { NgDocKindIconComponent } from '@ng-doc/app/components/kind-icon';
import { NgDocSearchResult } from '@ng-doc/app/interfaces';
import { NgDocApiListDeclaration, NgDocApiListIndexService } from '@ng-doc/app/services';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import type { NgDocPageIndex } from '@ng-doc/core/interfaces';
import {
  NG_DOC_DIALOG_DATA,
  NgDocSelectionComponent,
  NgDocSelectionHostDirective,
  NgDocSelectionOriginDirective,
  NgDocSpinnerComponent,
} from '@ng-doc/ui-kit';
import { NgDocOverlayRef } from '@ng-doc/ui-kit/classes';
import { of, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/**
 * Data of the search palette dialog.
 */
export interface NgDocCommandPaletteData {
  /**
   * The text the search field starts with.
   */
  query?: string;
}

/**
 * The scope the search palette shows results for.
 */
export type NgDocCommandPaletteScope = 'all' | 'guides' | 'api' | 'actions';

type RowType = 'api' | 'guide' | 'action';

interface Segment {
  text: string;
  match: boolean;
}

interface Row {
  id: string;
  type: RowType;
  label: Segment[];
  title: string;
  meta: string;
  icon: 'symbol' | 'page' | 'section' | 'action';
  kind?: string;
  scope?: string;
  url?: string;
  text?: string;
  signature?: string;
  keys?: string[];
  action?: Action;
  /** Whether the row is a declaration whose name starts with the query. */
  pinned?: boolean;
}

interface Section {
  key: string;
  type: RowType;
  title: string;
  rows: Row[];
}

interface Action {
  name: () => string;
  keywords: string;
  keys: string[];
  keepOpen?: boolean;
  run: () => void;
}

type ApiSymbol = NgDocApiListDeclaration;

const SCOPES: ReadonlyArray<{ id: NgDocCommandPaletteScope; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'guides', label: 'Guides' },
  { id: 'api', label: 'API' },
  { id: 'actions', label: 'Actions' },
];

/**
 * How many declarations whose name starts with the query rank above the guides, and the shortest
 * query that pins them: one or two letters start too many names to single any out.
 */
const PINNED_LIMIT = 3;
const PINNED_MIN_QUERY = 3;

/** How long typing pauses before the search runs, in milliseconds. */
const SEARCH_DEBOUNCE = 120;

/**
 * The search palette: a search field with scopes (all, guides, API and actions), a list of
 * results grouped by type (guides first, then the API), a preview of the selected result and the
 * switch for single-key shortcuts. The navbar search opens it with Command+K (Control+K) or the
 * slash key.
 */
@Component({
  selector: 'ng-doc-command-palette',
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss',
  // The palette styles the dialog pane and backdrop around it, which sit outside its host.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    NgTemplateOutlet,
    NgDocKindIconComponent,
    NgDocSelectionComponent,
    NgDocSelectionHostDirective,
    NgDocSelectionOriginDirective,
    NgDocSpinnerComponent,
  ],
  host: {
    'animate.enter': 'ng-doc-command-palette-enter',
  },
})
export class NgDocCommandPaletteComponent {
  protected readonly scopes = SCOPES;
  protected readonly shortcuts = inject(NgDocShortcutsService);

  private readonly data = inject<NgDocCommandPaletteData | null>(NG_DOC_DIALOG_DATA, {
    optional: true,
  });
  private readonly overlayRef = inject(NgDocOverlayRef, { optional: true });
  private readonly router = inject(Router);
  private readonly searchEngine = inject(NgDocSearchEngine, { optional: true });
  private readonly apiLists = inject(NgDocApiListIndexService);

  protected readonly model = signal({ query: this.data?.query ?? '' });
  protected readonly searchForm = form(this.model);
  protected readonly scope = signal<NgDocCommandPaletteScope>('all');
  protected readonly query = computed(() => this.model().query.trim());

  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private readonly list = viewChild.required<ElementRef<HTMLElement>>('list');

  private readonly results = rxResource({
    params: () => this.query() || undefined,
    stream: ({ params }) =>
      timer(SEARCH_DEBOUNCE).pipe(
        switchMap(() => this.searchEngine?.search(params) ?? of<NgDocSearchResult[]>([])),
      ),
  });

  // The last results stay visible while the next query runs, so the list does not flicker.
  private readonly hits = linkedSignal<
    { query: string; failed: boolean; hits?: NgDocSearchResult[] },
    NgDocSearchResult[]
  >({
    source: () => ({
      query: this.query(),
      failed: this.results.status() === 'error',
      hits: this.results.hasValue() ? this.results.value() : undefined,
    }),
    // A failed search shows the failure, not the hits of the previous query.
    computation: (source, previous) =>
      source.query && !source.failed ? source.hits ?? previous?.value ?? [] : [],
  });

  // The generated API lists give the kind and scope of every declaration, and let the palette
  // match declaration names directly. Without them the palette shows search results only.
  private readonly symbols: Signal<ApiSymbol[]> = this.apiLists.declarations;

  private readonly symbolsByRoute = computed(
    () => new Map(this.symbols().map((symbol: ApiSymbol) => [symbol.route, symbol])),
  );

  private readonly actions: Action[] = [
    {
      name: () => 'Toggle dark mode',
      keywords: 'theme dark light mode',
      keys: ['T'],
      run: () => this.shortcuts.run('t'),
    },
    {
      name: () => 'Copy link to this page',
      keywords: 'copy link url share',
      keys: ['L'],
      run: () => this.shortcuts.run('l'),
    },
    {
      name: () =>
        this.shortcuts.enabled() ? 'Turn off single-key shortcuts' : 'Turn on single-key shortcuts',
      keywords: 'keyboard shortcuts keys single',
      keys: [],
      keepOpen: true,
      run: () => this.shortcuts.toggle(),
    },
  ];

  protected readonly sections: Signal<Section[]> = computed(() => {
    const scope = this.scope();
    const query = this.query();
    const sections: Section[] = [];

    let apiRows: Row[] =
      (scope === 'all' || scope === 'api') && query ? this.apiRows(query, scope === 'api') : [];

    // Guides rank above the API reference: readers who search a topic usually want the guide
    // that explains it first. A declaration whose name starts with the query is what the reader
    // typed, though: it stays on top, so Enter opens it however the guide search ranks.
    if (scope === 'all' && query) {
      const pinned = apiRows.filter((row: Row) => row.pinned).slice(0, PINNED_LIMIT);

      apiRows = apiRows.filter((row: Row) => !pinned.includes(row));
      sections.push({ key: 'top', type: 'api', title: 'Top matches', rows: pinned });
    }
    if ((scope === 'all' || scope === 'guides') && query) {
      sections.push({
        key: 'guide',
        type: 'guide',
        title: 'Guides',
        rows: this.guideRows(query, scope === 'guides'),
      });
    }
    if (apiRows.length) {
      sections.push({ key: 'api', type: 'api', title: 'API', rows: apiRows });
    }
    if (scope === 'all' || scope === 'actions') {
      sections.push({
        key: 'action',
        type: 'action',
        title: 'Actions',
        rows: this.actionRows(query),
      });
    }

    let index = 0;

    return sections
      .filter((section: Section) => section.rows.length)
      .map((section: Section) => ({
        ...section,
        rows: section.rows.map((row: Row) => ({ ...row, id: `ng-doc-palette-option-${index++}` })),
      }));
  });

  protected readonly rows = computed(() =>
    this.sections().flatMap((section: Section) => section.rows),
  );

  // Whether the reader moved the selection (with the keyboard or the pointer) since the query or
  // the scope last changed.
  private readonly moved = linkedSignal({
    source: () => [this.query(), this.scope()],
    computation: () => false,
  });

  // The first result is selected whenever the results change, unless the reader moved the
  // selection: then it stays on the same result while the other source (the declaration names or
  // the asynchronous search) adds rows around it.
  protected readonly active = linkedSignal<Row[], number>({
    source: this.rows,
    computation: (rows: Row[], previous?: { source: Row[]; value: number }) => {
      const kept = previous && untracked(this.moved) ? previous.source[previous.value] : undefined;
      const index = kept ? rows.findIndex((row: Row) => sameResult(row, kept)) : -1;

      return Math.max(index, 0);
    },
  });
  protected readonly selected = computed(() => this.rows()[this.active()]);
  protected readonly searching = computed(
    () => !!this.query() && this.results.isLoading() && !this.hits().length,
  );
  protected readonly failed = computed(() => this.results.status() === 'error');
  protected readonly emptyMessage = computed(() => {
    const query = this.query();

    if (query) {
      return `No results for “${query}”`;
    }

    return this.scope() === 'api'
      ? 'Type to search the API.'
      : this.scope() === 'guides'
        ? 'Type to search the guides.'
        : 'Type to search.';
  });

  /** What the status region announces: the scope, a running search, no results or a failure. */
  protected readonly status = computed(() => {
    const scope = SCOPES.find(({ id }) => id === this.scope())?.label ?? '';
    const count = this.rows().filter((row: Row) => row.type !== 'action').length;

    if (this.failed()) {
      return 'Search failed.';
    }
    if (this.searching()) {
      return 'Searching…';
    }
    if (!this.query()) {
      return `${scope} scope.`;
    }

    return count
      ? `${scope} scope: ${count} ${count === 1 ? 'result' : 'results'}.`
      : `${scope} scope: no results for “${this.query()}”.`;
  });

  // Increments when the selection moves by keyboard, so only those moves scroll the list.
  private readonly keyboardMove = signal(0);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  constructor() {
    void this.apiLists.load();

    afterNextRender(() => {
      const input = this.input().nativeElement;

      input.focus();
      input.select();
    });

    afterRenderEffect(() => {
      if (!this.keyboardMove()) {
        return;
      }

      const id = untracked(this.selected)?.id;
      const option = id ? this.list().nativeElement.querySelector(`#${id}`) : null;

      option?.scrollIntoView?.({ block: 'nearest' });
    });
  }

  /**
   * Handles the keys of the search field: the arrow keys move the selection and Enter opens the
   * selected result. Keys that compose text in an input method editor are left alone.
   * @param event - The keyboard event of the search field.
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.keyCode === 229) {
      return;
    }

    untracked(() => {
      switch (event.key) {
        case 'ArrowDown':
        case 'ArrowUp':
          event.preventDefault();
          this.move(event.key === 'ArrowDown' ? 1 : -1);
          break;
        case 'Enter':
          event.preventDefault();
          this.activate(this.selected());
          break;
      }
    });
  }

  /**
   * Handles the keys of the scope tabs: the arrow keys, Home and End select and focus a scope.
   * @param event - The keyboard event of a scope tab.
   */
  protected onScopeKeydown(event: KeyboardEvent): void {
    const index = SCOPES.findIndex(({ id }) => id === untracked(this.scope));
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % SCOPES.length
        : event.key === 'ArrowLeft'
          ? (index - 1 + SCOPES.length) % SCOPES.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? SCOPES.length - 1
              : -1;

    if (next < 0) {
      return;
    }

    event.preventDefault();
    this.scope.set(SCOPES[next].id);
    this.host.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
  }

  /**
   * Keeps Tab inside the palette: from its last tab stop focus wraps to the search field, and
   * Shift+Tab from the search field goes to the last tab stop.
   * @param event - A keyboard event inside the palette.
   */
  protected onTrapKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') {
      return;
    }

    const stops = Array.from(
      this.host.querySelectorAll<HTMLElement>('input, button:not([tabindex="-1"])'),
    );
    const first = stops[0];
    const last = stops[stops.length - 1];

    if (!event.shiftKey && event.target === last) {
      event.preventDefault();
      first?.focus();
    } else if (event.shiftKey && event.target === first) {
      event.preventDefault();
      last?.focus();
    }
  }

  /**
   * Selects a scope by click and returns the focus to the search field.
   * @param scope - The scope to select.
   */
  protected selectScope(scope: NgDocCommandPaletteScope): void {
    this.scope.set(scope);
    this.input().nativeElement.focus();
  }

  /**
   * Selects the result under the pointer, without scrolling the list.
   * @param index - The index of the result.
   */
  protected hover(index: number): void {
    if (untracked(this.active) !== index) {
      this.active.set(index);
      this.moved.set(true);
    }
  }

  /**
   * Opens the given result: navigates to a page or runs an action.
   * @param row - The result to open.
   */
  protected activate(row: Row | undefined): void {
    if (!row) {
      return;
    }

    if (row.action) {
      if (!row.action.keepOpen) {
        this.close();
      }

      row.action.run();

      return;
    }

    this.close();

    if (row.url) {
      void this.router.navigateByUrl(row.url);
    }
  }

  private move(step: number): void {
    const count = this.rows().length;

    if (count) {
      this.active.set((this.active() + step + count) % count);
      this.moved.set(true);
      this.keyboardMove.update((value: number) => value + 1);
    }
  }

  private close(): void {
    this.overlayRef?.close();
  }

  private apiRows(query: string, all: boolean): Row[] {
    const rows = new Map<string, Row>();
    const needle = query.toLowerCase();
    const matches = this.symbols()
      .filter((symbol: ApiSymbol) => symbol.name.toLowerCase().includes(needle))
      .sort(
        (a: ApiSymbol, b: ApiSymbol) =>
          a.name.toLowerCase().indexOf(needle) - b.name.toLowerCase().indexOf(needle) ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name),
      );

    for (const symbol of matches) {
      // The summary record of the symbol's page, when the query found it.
      const hit = this.hitsFor(symbol.route);

      rows.set(symbol.route, {
        id: '',
        type: 'api',
        pinned: needle.length >= PINNED_MIN_QUERY && symbol.name.toLowerCase().startsWith(needle),
        title: symbol.name,
        label: highlight(symbol.name, query),
        meta: symbol.scope,
        icon: 'symbol',
        kind: symbol.kind,
        scope: symbol.scope,
        url: `/${symbol.route}`,
        text: hit?.description ?? symbol.description ?? hit?.content,
        signature: hit?.signature ?? symbol.signature,
      });
    }

    for (const hit of this.hits()) {
      const index: NgDocPageIndex = hit.index;

      if (index.pageType !== 'api') {
        continue;
      }

      const key = routeKey(index.route) + (index.fragment ? `#${index.fragment}` : '');

      if (rows.has(key) || (!index.fragment && rows.has(routeKey(index.route)))) {
        continue;
      }

      const symbol = this.symbolsByRoute().get(routeKey(index.route));
      const scope = symbol?.scope ?? index.breadcrumbs[1] ?? '';
      // Only one record of a page carries the declaration's summary: a hit on another record of
      // the page takes it from that record (when the query found it too) or from the API list.
      const summary = index.fragment ? undefined : this.hitsFor(routeKey(index.route));

      rows.set(key, {
        id: '',
        type: 'api',
        title: index.title,
        label: highlight(index.title, query),
        meta: index.section ? `${index.section} · ${scope}` : scope,
        icon: 'symbol',
        kind: index.kind ?? summary?.kind ?? symbol?.kind,
        scope,
        url: pageUrl(index),
        text: index.fragment
          ? index.description ?? index.content
          : summary?.description ?? symbol?.description ?? index.content,
        signature: index.fragment ? index.signature : summary?.signature ?? symbol?.signature,
      });
    }

    return [...rows.values()].slice(0, all ? 12 : 6);
  }

  private guideRows(query: string, all: boolean): Row[] {
    const rows = new Map<string, Row>();

    for (const hit of this.hits()) {
      const index = hit.index;

      if (index.pageType !== 'guide') {
        continue;
      }

      const key = routeKey(index.route) + (index.fragment ? `#${index.fragment}` : '');

      if (rows.has(key)) {
        continue;
      }

      const title = index.section || index.title;
      const path = index.section
        ? index.breadcrumbs
        : index.breadcrumbs.slice(0, Math.max(index.breadcrumbs.length - 1, 0));

      rows.set(key, {
        id: '',
        type: 'guide',
        title,
        label: highlight(title, query),
        meta: path.join(' › '),
        icon: index.fragment ? 'section' : 'page',
        url: pageUrl(index),
        text: index.content,
      });
    }

    return [...rows.values()].slice(0, all ? 12 : 5);
  }

  private actionRows(query: string): Row[] {
    const needle = query.toLowerCase();

    return this.actions
      .filter(
        (action: Action) =>
          !needle ||
          action.name().toLowerCase().includes(needle) ||
          action.keywords.split(' ').some((word: string) => word.startsWith(needle)),
      )
      .map((action: Action) => ({
        id: '',
        type: 'action',
        title: action.name(),
        label: highlight(action.name(), query),
        meta: '',
        icon: 'action',
        keys: action.keys,
        action,
      }));
  }

  /**
   * The hit of a symbol's page that previews it: the record with the declaration's summary (the
   * new engine puts it on one record of the page), or else any record outside a section.
   * @param route - The route of the symbol's page.
   */
  private hitsFor(route: string): NgDocPageIndex | undefined {
    const page = this.hits()
      .map((hit: NgDocSearchResult) => hit.index)
      .filter((index: NgDocPageIndex) => routeKey(index.route) === route && !index.section);

    return (
      page.find((index: NgDocPageIndex) => index.signature !== undefined || !!index.kind) ?? page[0]
    );
  }
}

/**
 * Splits a text around the first case-insensitive occurrence of the query.
 * @param text - The text to split.
 * @param query - The query to find.
 */
function highlight(text: string, query: string): Segment[] {
  const start = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;

  if (start < 0) {
    return [{ text, match: false }];
  }

  const end = start + query.length;

  return [
    { text: text.slice(0, start), match: false },
    { text: text.slice(start, end), match: true },
    { text: text.slice(end), match: false },
  ].filter((segment: Segment) => segment.text);
}

/**
 * Whether two rows open the same result.
 * @param a - A row.
 * @param b - Another row.
 */
function sameResult(a: Row, b: Row): boolean {
  return a.type === b.type && (a.action ? a.action === b.action : a.url === b.url);
}

/**
 * Normalizes a route to compare search records with the API list.
 * @param route - A route with or without the leading slash.
 */
function routeKey(route: string): string {
  return route.replace(/^\/+/, '');
}

/**
 * Builds the URL of a search record.
 * @param index - The search record.
 */
function pageUrl(index: NgDocPageIndex): string {
  return `/${routeKey(index.route)}${index.fragment ? `#${index.fragment}` : ''}`;
}
