import {
  afterNextRender,
  DestroyRef,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  NgZone,
  Signal,
  signal,
  untracked,
} from '@angular/core';
import { NgDocShortcutsService } from '@ng-doc/app/services/shortcuts';

const TAB = '[data-ng-doc-members-tab]';
const FILTER = 'input[data-ng-doc-members-filter]';
const MEMBER = '.ng-doc-member[data-group]';
const GROUP = '.ng-doc-members-group[data-group]';
const EXPAND = '.ng-doc-member-expand[aria-controls]';
const COUNT = '.ng-doc-members-count';
const EMPTY = '.ng-doc-members-empty';
const ALL = 'all';
const INHERITED = 'inherited';

/**
 * Adds the member tabs, the name filter and the expandable method rows to the members table of
 * an API page. The page renders every member, so the table reads well without it (on the server
 * and before hydration); the directive only hides rows.
 *
 * It reads this markup inside its host: tab buttons with a data-ng-doc-members-tab attribute
 * ("all", "inherited" or a group name, each with an optional .ng-doc-members-count), a text input
 * with a data-ng-doc-members-filter attribute, group rows (.ng-doc-members-group with data-group)
 * and member rows (.ng-doc-member with data-group, data-name and, for inherited members,
 * data-inherited). A .ng-doc-member-expand button in a member row shows and hides the detail row
 * its aria-controls names, and an optional .ng-doc-members-empty element shows when no member
 * matches. F focuses the filter while single-key shortcuts are on.
 */
@Directive({
  selector: '[ngDocMembersFilter]',
  host: {
    '(click)': 'onClick($event)',
    '(input)': 'onInput($event)',
    '(keydown)': 'onKeydown($event)',
  },
})
export class NgDocMembersFilterDirective {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly selectedTab = signal(ALL);
  private readonly filterQuery = signal('');
  private ready = false;

  /** The selected tab: "all", "inherited" or a group name. */
  readonly tab: Signal<string> = this.selectedTab.asReadonly();
  /** The text the member names are filtered by. */
  readonly query: Signal<string> = this.filterQuery.asReadonly();

  constructor() {
    const destroyRef = inject(DestroyRef);
    const ngZone = inject(NgZone);
    const window = inject(DOCUMENT).defaultView;
    const removeShortcut = inject(NgDocShortcutsService).register({
      key: 'f',
      handler: () => this.host.querySelector<HTMLInputElement>(FILTER)?.focus(),
    });

    destroyRef.onDestroy(removeShortcut);

    // The markup is rendered by the page, so the directive only starts working in the browser.
    afterNextRender(() => {
      this.ready = true;
      this.countTabs();

      const selected = this.tabs().find(
        (tab: HTMLElement) => tab.getAttribute('aria-selected') === 'true',
      );

      this.select(selected?.dataset['ngDocMembersTab'] ?? ALL);

      // Rows of tabs that scroll inside themselves fade on the edge that still hides tabs.
      const fade = () => this.fade();
      const onScroll = (event: Event) => {
        if (event.target instanceof Element && event.target.querySelector(TAB)) {
          this.fade();
        }
      };

      ngZone.runOutsideAngular(() => {
        this.host.addEventListener('scroll', onScroll, true);
        window?.addEventListener('resize', fade);
      });
      destroyRef.onDestroy(() => {
        this.host.removeEventListener('scroll', onScroll, true);
        window?.removeEventListener('resize', fade);
      });
      this.fade();
    });
  }

  /**
   * Shows the members of a tab.
   * @param tab - "all", "inherited" or a group name.
   */
  select(tab: string): void {
    untracked(() => {
      this.selectedTab.set(tab);

      for (const button of this.tabs()) {
        const selected = button.dataset['ngDocMembersTab'] === tab;

        button.setAttribute('aria-selected', String(selected));
        button.tabIndex = selected ? 0 : -1;
      }

      this.apply();
    });
  }

  /**
   * Shows the members whose name contains the text.
   * @param query - The text; case is ignored.
   */
  filter(query: string): void {
    untracked(() => {
      this.filterQuery.set(query);

      const input = this.host.querySelector<HTMLInputElement>(FILTER);

      if (input && input.value !== query) {
        input.value = query;
      }

      this.apply();
    });
  }

  protected onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest<HTMLElement>(TAB);
    const expand = target?.closest<HTMLElement>(EXPAND);

    if (tab && this.host.contains(tab) && !tab.hasAttribute('disabled')) {
      this.select(tab.dataset['ngDocMembersTab'] ?? ALL);
    } else if (expand && this.host.contains(expand)) {
      expand.setAttribute('aria-expanded', String(expand.getAttribute('aria-expanded') !== 'true'));
      this.apply();
    }
  }

  protected onInput(event: Event): void {
    if (event.target instanceof HTMLInputElement && event.target.matches(FILTER)) {
      this.filter(event.target.value);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const tab = event.target instanceof Element ? event.target.closest<HTMLElement>(TAB) : null;

    if (!tab) {
      return;
    }

    const tabs = this.tabs().filter((button: HTMLElement) => !button.hasAttribute('disabled'));
    const index = tabs.indexOf(tab);
    const next =
      event.key === 'ArrowRight'
        ? tabs[(index + 1) % tabs.length]
        : event.key === 'ArrowLeft'
          ? tabs[(index - 1 + tabs.length) % tabs.length]
          : event.key === 'Home'
            ? tabs[0]
            : event.key === 'End'
              ? tabs[tabs.length - 1]
              : undefined;

    if (next) {
      event.preventDefault();
      next.focus();
      this.select(next.dataset['ngDocMembersTab'] ?? ALL);
    }
  }

  private tabs(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(TAB));
  }

  private members(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(MEMBER));
  }

  private countTabs(): void {
    const members = this.members();

    for (const button of this.tabs()) {
      const tab = button.dataset['ngDocMembersTab'] ?? ALL;
      const count = members.filter((member: HTMLElement) => inTab(member, tab)).length;
      const counter = button.querySelector(COUNT);

      if (counter) {
        counter.textContent = String(count);
      }

      button.toggleAttribute('disabled', tab !== ALL && count === 0);
    }
  }

  private apply(): void {
    if (!this.ready) {
      return;
    }

    const tab = this.selectedTab();
    const query = this.filterQuery().trim().toLowerCase();
    const visible = new Map<string, number>();

    for (const member of this.members()) {
      const group = member.dataset['group'] ?? '';
      const name = (member.dataset['name'] ?? member.textContent ?? '').toLowerCase();
      const shown = inTab(member, tab) && (!query || name.includes(query));

      member.hidden = !shown;
      visible.set(group, (visible.get(group) ?? 0) + (shown ? 1 : 0));

      for (const expand of Array.from(member.querySelectorAll<HTMLElement>(EXPAND))) {
        const detail = this.host.ownerDocument.getElementById(
          expand.getAttribute('aria-controls') ?? '',
        );

        if (detail && this.host.contains(detail)) {
          detail.hidden = !shown || expand.getAttribute('aria-expanded') !== 'true';
        }
      }
    }

    for (const group of Array.from(this.host.querySelectorAll<HTMLElement>(GROUP))) {
      const count = visible.get(group.dataset['group'] ?? '') ?? 0;
      const counter = group.querySelector(COUNT);

      group.hidden = count === 0;

      if (counter) {
        counter.textContent = String(count);
      }
    }

    const empty = this.host.querySelector<HTMLElement>(EMPTY);

    if (empty) {
      empty.hidden = this.members().some((member: HTMLElement) => !member.hidden);
    }
  }

  private fade(): void {
    const list = this.tabs()[0]?.parentElement;

    if (!list) {
      return;
    }

    const max = list.scrollWidth - list.clientWidth;
    const edges = [
      ...(max > 1 && list.scrollLeft > 1 ? ['start'] : []),
      ...(max > 1 && list.scrollLeft < max - 1 ? ['end'] : []),
    ];

    if (edges.length) {
      list.dataset['fade'] = edges.join(' ');
    } else {
      delete list.dataset['fade'];
    }
  }
}

/**
 * Whether a member row belongs to a tab.
 * @param member - The member row.
 * @param tab - "all", "inherited" or a group name.
 */
function inTab(member: HTMLElement, tab: string): boolean {
  return (
    tab === ALL ||
    (tab === INHERITED ? member.hasAttribute('data-inherited') : member.dataset['group'] === tab)
  );
}
