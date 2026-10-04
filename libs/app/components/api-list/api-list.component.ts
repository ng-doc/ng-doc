import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, ParamMap, Params, Router, RouterLink } from '@angular/router';
import { NgDocKindIconComponent, ngDocKindLabel } from '@ng-doc/app/components/kind-icon';
import { NgDocApiListIndexService } from '@ng-doc/app/services';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';
import { asArray } from '@ng-doc/core/helpers/as-array';
import type { NgDocApiList, NgDocApiListItem } from '@ng-doc/core/interfaces';
import {
  NgDocSelectionComponent,
  NgDocSelectionHostDirective,
  NgDocSelectionOriginDirective,
} from '@ng-doc/ui-kit/components/selection';
import { NG_REQUEST_BASE_PATH } from '@ng-doc/ui-kit/tokens';

/**
 * Orders kinds and names in English whatever the locale: `localeCompare` without a locale follows
 * the process locale, so a prerendered index would depend on the machine that built it, and the
 * browser would order a hydrated index differently from its prerendered HTML.
 */
const NAME_ORDER = new Intl.Collator('en');

/** How the API index groups declarations. */
type GroupBy = 'kind' | 'scope';

/**
 * A declaration of the API list. The generated list may carry a one-line description; the index
 * filters by it and shows it when it is present.
 */
interface Declaration extends NgDocApiListItem {
  description?: string;
  scope: string;
}

interface Group {
  id: string;
  kind?: string;
  label: string;
  items: Declaration[];
}

interface KindFilter {
  kind: string;
  label: string;
  count: number;
}

/**
 * The index of API declarations: a filter that matches names and descriptions, grouping by kind
 * or by scope, and a kind filter with counts. The filter, kind, scope and grouping are kept in
 * the query parameters (filter, type, scope and group), so a filtered index can be linked.
 */
@Component({
  selector: 'ng-doc-api-list',
  templateUrl: './api-list.component.html',
  styleUrls: ['./api-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    NgDocKindIconComponent,
    NgDocSelectionComponent,
    NgDocSelectionHostDirective,
    NgDocSelectionOriginDirective,
    RouterLink,
  ],
})
export class NgDocApiListComponent {
  /** The title of the page. */
  readonly title = input<string>('API References');
  /** The segment of the API list data, when the site has more than one API list. */
  readonly segment = input<string>();

  protected readonly shortcuts = inject(NgDocShortcutsService);
  protected readonly model = signal({ filter: '' });
  protected readonly filterForm = form(this.model);
  protected readonly kind = signal('');
  protected readonly scope = signal('');
  protected readonly groupBy = signal<GroupBy>('kind');

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly basePath = inject(NG_REQUEST_BASE_PATH);
  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  private readonly apiList = httpResource<NgDocApiList[]>(
    () => this.basePath + asArray('assets/ng-doc', this.segment(), 'api-list.json').join('/'),
  );

  protected readonly declarations: Signal<Declaration[]> = computed(() =>
    this.apiList.hasValue()
      ? (this.apiList.value() ?? []).flatMap((scope: NgDocApiList) =>
          scope.items.map((item: NgDocApiListItem) => ({ ...item, scope: scope.title })),
        )
      : [],
  );

  protected readonly scopes = computed(() =>
    [...new Set(this.declarations().map(({ scope }: Declaration) => scope))].sort(),
  );

  protected readonly hasDescriptions = computed(() =>
    this.declarations().some(({ description }: Declaration) => !!description),
  );

  /** Declarations in the selected scope, before the text and kind filters. */
  protected readonly inScope = computed(() =>
    this.declarations().filter(({ scope }: Declaration) => !this.scope() || scope === this.scope()),
  );

  protected readonly kinds: Signal<KindFilter[]> = computed(() => {
    const counts = new Map<string, number>();

    for (const { type } of this.inScope()) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    return [...counts]
      .map(([kind, count]: [string, number]) => ({ kind, label: ngDocKindLabel(kind), count }))
      .sort((a: KindFilter, b: KindFilter) => NAME_ORDER.compare(a.label, b.label));
  });

  protected readonly visible = computed(() => {
    const needle = this.model().filter.trim().toLowerCase();
    const kind = this.kind();

    return this.inScope().filter(
      (item: Declaration) =>
        (!kind || item.type === kind) &&
        (!needle ||
          item.name.toLowerCase().includes(needle) ||
          !!item.description?.toLowerCase().includes(needle)),
    );
  });

  protected readonly groups: Signal<Group[]> = computed(() => {
    const byName = (a: Declaration, b: Declaration) => NAME_ORDER.compare(a.name, b.name);

    if (this.groupBy() === 'scope') {
      return this.scopes()
        .map((scope: string) => ({
          id: `scope-${slug(scope)}`,
          label: scope,
          items: this.visible()
            .filter((item: Declaration) => item.scope === scope)
            .sort(
              (a: Declaration, b: Declaration) =>
                NAME_ORDER.compare(ngDocKindLabel(a.type), ngDocKindLabel(b.type)) || byName(a, b),
            ),
        }))
        .filter((group: Group) => group.items.length);
    }

    return this.kinds()
      .map(({ kind, label }: KindFilter) => ({
        id: `kind-${slug(kind)}`,
        kind,
        label,
        items: this.visible()
          .filter((item: Declaration) => item.type === kind)
          .sort(byName),
      }))
      .filter((group: Group) => group.items.length);
  });

  protected readonly loaded = computed(() => this.apiList.hasValue());
  protected readonly failed = computed(() => this.apiList.status() === 'error');

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params: ParamMap) => {
      const filter = params.get('filter') ?? '';

      if (untracked(this.model).filter !== filter) {
        this.model.set({ filter });
      }
      this.kind.set(params.get('type') ?? '');
      this.scope.set(params.get('scope') ?? '');
      this.groupBy.set(params.get('group') === 'scope' ? 'scope' : 'kind');
    });

    // Writes the state back to the query parameters. It navigates only when they differ, so the
    // navigation it causes does not run it again.
    effect(() => {
      const wanted: Params = {
        filter: this.model().filter || null,
        type: this.kind() || null,
        scope: this.scope() || null,
        group: this.groupBy() === 'scope' ? 'scope' : null,
      };

      untracked(() => {
        const current = this.route.snapshot.queryParamMap;
        const changed = Object.keys(wanted).some(
          (key: string) => (current.get(key) ?? null) !== wanted[key],
        );

        if (changed) {
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: wanted,
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        }
      });
    });

    // The search palette reuses the list this page loaded instead of requesting it again.
    const apiLists = inject(NgDocApiListIndexService);

    effect(() => {
      if (this.apiList.hasValue()) {
        const list = this.apiList.value();
        const segment = this.segment() ?? '';

        untracked(() => apiLists.remember(segment, list ?? []));
      }
    });

    const removeShortcut = this.shortcuts.register({
      key: 'f',
      handler: () => this.filterInput()?.nativeElement.focus(),
    });

    inject(DestroyRef).onDestroy(removeShortcut);
  }

  /**
   * Shows only the declarations of a kind, or of every kind.
   * @param kind - The kind, or an empty string for every kind.
   */
  protected selectKind(kind: string): void {
    this.kind.set(kind);
  }

  /**
   * Groups the declarations by kind or by scope.
   * @param groupBy - The grouping.
   */
  protected selectGroupBy(groupBy: GroupBy): void {
    this.groupBy.set(groupBy);
  }

  /** Shows the declarations of every scope. */
  protected clearScope(): void {
    this.scope.set('');
  }
}

/**
 * An id fragment for a kind or a scope.
 * @param value - The kind or the scope.
 */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
