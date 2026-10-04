import { ChangeDetectionStrategy, Component, Input, input, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NgDocBreadcrumbComponent } from '@ng-doc/app/components/breadcrumb';
import { NgDocPageNavigationComponent } from '@ng-doc/app/components/page-navigation';
import { NgDocPageWrapperComponent } from '@ng-doc/app/components/page-wrapper';
import {
  NgDocNavigation,
  NgDocPageBreadcrumbs,
  NgDocPageNavigation,
  NgDocPageSkeleton,
} from '@ng-doc/app/interfaces';
import { NG_DOC_CONTEXT, NG_DOC_PAGE_SKELETON } from '@ng-doc/app/tokens';
import { expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

@Component({
  selector: 'ng-doc-signal-crumbs',
  template: `<p class="crumbs">{{ breadcrumbs().join(' / ') }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SignalCrumbsComponent implements NgDocPageBreadcrumbs {
  readonly breadcrumbs = input.required<string[]>();
}

@Component({
  selector: 'ng-doc-decorator-crumbs',
  template: `<p class="crumbs">{{ breadcrumbs.join(' / ') }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DecoratorCrumbsComponent implements NgDocPageBreadcrumbs {
  @Input() breadcrumbs: string[] = [];
}

@Component({
  selector: 'ng-doc-signal-pager',
  template: `<p class="pager">{{ prevPage()?.title }} | {{ nextPage()?.title }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SignalPagerComponent implements NgDocPageNavigation {
  readonly prevPage = input<NgDocNavigation>();
  readonly nextPage = input<NgDocNavigation>();
}

@Component({
  selector: 'ng-doc-decorator-pager',
  template: `<p class="pager">{{ prevPage?.title }} | {{ nextPage?.title }}</p>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DecoratorPagerComponent implements NgDocPageNavigation {
  @Input() prevPage?: NgDocNavigation;
  @Input() nextPage?: NgDocNavigation;
}

@Component({
  selector: 'ng-doc-wrapper-host',
  imports: [NgDocPageWrapperComponent],
  template: `<ng-doc-page-wrapper [routes]="[]" headerContent="" pageType="guide" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WrapperHostComponent {}

const NAVIGATION: NgDocNavigation[] = [
  {
    title: 'Guides',
    route: '/docs',
    children: [
      { title: 'First', route: '/docs/first' },
      { title: 'Page', route: '/docs/page' },
      { title: 'Last', route: '/docs/last' },
    ],
  },
];

describeChangeDetection('Page skeleton', ({ providers }) => {
  /**
   * Renders a page wrapper at /docs/page with the given skeleton.
   * @param skeleton - The page skeleton.
   * @returns The rendered page element.
   */
  async function render(skeleton: NgDocPageSkeleton): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([
          {
            path: 'docs',
            title: 'Guides',
            children: [{ path: 'page', title: 'Page', component: WrapperHostComponent }],
          },
        ]),
        { provide: NG_DOC_CONTEXT, useValue: { navigation: NAVIGATION } },
        { provide: NG_DOC_PAGE_SKELETON, useValue: skeleton },
      ],
    });
    const harness = await RouterTestingHarness.create('/docs/page');

    harness.detectChanges();
    await harness.fixture.whenStable();

    return harness.routeNativeElement!;
  }

  const cases: Array<[string, Type<NgDocPageBreadcrumbs>, Type<NgDocPageNavigation>]> = [
    ['signal inputs', SignalCrumbsComponent, SignalPagerComponent],
    ['decorator inputs', DecoratorCrumbsComponent, DecoratorPagerComponent],
  ];

  it.each(cases)('renders custom components with %s', async (_, breadcrumbs, navigation) => {
    const element = await render({ breadcrumbs, navigation });

    expect(element.querySelector('.crumbs')?.textContent).toBe('Guides / Page');
    expect(element.querySelector('.pager')?.textContent).toBe('First | Last');
  });

  it('renders the default breadcrumbs as a landmark and the pager as two cards', async () => {
    const element = await render({
      breadcrumbs: NgDocBreadcrumbComponent,
      navigation: NgDocPageNavigationComponent,
    });
    const crumbs = element.querySelector('nav[aria-label="Breadcrumb"]')!;
    const items = Array.from(crumbs.querySelectorAll('li'), (li) => [
      li.textContent?.trim(),
      li.getAttribute('aria-current') ?? li.getAttribute('aria-hidden'),
    ]);

    expect(items).toEqual([
      ['Guides', null],
      ['›', 'true'],
      ['Page', 'page'],
    ]);

    const pager = element.querySelector('nav[aria-label="Previous and next page"]')!;
    const links = Array.from(pager.querySelectorAll('a'), (link) => [
      link.querySelector('.ng-doc-navigation-page-title')?.textContent,
      link.getAttribute('href'),
    ]);

    expect(links).toEqual([
      ['First', '/docs/first'],
      ['Last', '/docs/last'],
    ]);
  });
});
