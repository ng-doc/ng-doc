import { ViewportScroller } from '@angular/common';
import { ChangeDetectionStrategy, Component, Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocNavbarComponent } from '@ng-doc/app/components/navbar';
import { NgDocRootComponent } from '@ng-doc/app/components/root';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

@Component({
  selector: 'ng-doc-root-without-navbar',
  imports: [NgDocRootComponent],
  template: `
    <ng-doc-root>
      <p class="test-page">Page</p>
    </ng-doc-root>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WithoutNavbarComponent {}

@Component({
  selector: 'ng-doc-root-with-navbar',
  imports: [NgDocRootComponent, NgDocNavbarComponent],
  template: `
    <ng-doc-root>
      <ng-doc-navbar [search]="false"><span ngDocNavbarLeft>Brand</span></ng-doc-navbar>
      <p class="test-page">Page</p>
    </ng-doc-root>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WithNavbarComponent {}

// The marker is a plain attribute: the custom navbar is placed without importing its directive.
@Component({
  selector: 'ng-doc-root-with-custom-navbar',
  imports: [NgDocRootComponent],
  template: `
    <ng-doc-root>
      <header ngDocCustomNavbar>My header</header>
      <p class="test-page">Page</p>
    </ng-doc-root>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class WithCustomNavbarComponent {}

describeChangeDetection('NgDocRootComponent layout', ({ providers }) => {
  let scrollTo: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([]),
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
      ],
    });
  });

  afterEach(() => scrollTo.mockRestore());

  /**
   * Renders a host of the layout.
   * @param host - The host component.
   */
  async function render(host: Type<unknown>) {
    const fixture = TestBed.createComponent(host);

    await fixture.whenStable();

    return fixture;
  }

  /** The vertical scroll offset the router applies to anchors now. */
  function scrollOffset(): number {
    const anchor = document.createElement('div');

    anchor.id = 'root-layout-probe';
    document.body.append(anchor);
    scrollTo.mockClear();

    try {
      TestBed.inject(ViewportScroller).scrollToAnchor('root-layout-probe');
    } finally {
      anchor.remove();
    }

    // jsdom lays nothing out: the anchor is at the top, so the router scrolls to minus the offset.
    return 0 - (scrollTo.mock.calls[0][0] as ScrollToOptions).top!;
  }

  it('renders no header bar without navbar content', async () => {
    const fixture = await render(WithoutNavbarComponent);
    const header = fixture.nativeElement.querySelector('.ng-doc-header') as HTMLElement;

    // `.ng-doc-header:empty` hides the bar and gives the navbar no height.
    expect(header.matches(':empty')).toBe(true);
    expect(fixture.nativeElement.querySelector('.test-page')).not.toBeNull();
  });

  it.each([WithNavbarComponent, WithCustomNavbarComponent])(
    'keeps the header bar with navbar content (%o)',
    async (host) => {
      const fixture = await render(host);
      const header = fixture.nativeElement.querySelector('.ng-doc-header') as HTMLElement;

      expect(header.matches(':empty')).toBe(false);
      expect(header.childElementCount).toBe(1);
    },
  );

  it('scrolls anchors below the layout while it is shown and restores the offset after', async () => {
    const viewport = TestBed.inject(ViewportScroller);

    viewport.setOffset([0, 10]);
    const fixture = await render(WithNavbarComponent);

    expect(scrollOffset()).toBe(120);

    // The page area's margin is the layout's top offset, in pixels.
    (fixture.nativeElement.querySelector('main') as HTMLElement).style.marginTop = '32px';
    expect(scrollOffset()).toBe(152);

    fixture.destroy();
    expect(scrollOffset()).toBe(10);
  });

  it('keeps an offset that the application set while the layout was shown', async () => {
    const viewport = TestBed.inject(ViewportScroller);
    const fixture = await render(WithNavbarComponent);

    viewport.setOffset([0, 30]);
    fixture.destroy();

    expect(scrollOffset()).toBe(30);
  });

  it('restores the default offset when none was set before', async () => {
    const fixture = await render(WithoutNavbarComponent);

    expect(scrollOffset()).toBe(120);
    fixture.destroy();
    expect(scrollOffset()).toBe(0);
  });
});
