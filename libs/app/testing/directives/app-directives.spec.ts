import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, getDebugNode, inject, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By, DomSanitizer } from '@angular/platform-browser';
import { IsActiveMatchOptions, provideRouter, Router } from '@angular/router';
import { NgDocCopyButtonComponent } from '@ng-doc/app/components/copy-button';
import { NgDocHeadingAnchorComponent } from '@ng-doc/app/components/heading-anchor';
import { NgDocLinkComponent } from '@ng-doc/app/components/link';
import { NgDocRouteActiveDirective } from '@ng-doc/app/directives/route-active';
import {
  NgDocDecodeUriComponentPipe,
  NgDocFilterByTextPipe,
  NgDocSanitizeHtmlPipe,
} from '@ng-doc/app/pipes';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors/page-processor';
import { tooltipProcessor } from '@ng-doc/app/processors/processors/tooltip';
import { NG_DOC_PAGE_PROCESSOR } from '@ng-doc/app/tokens';
import { NgDocTooltipDirective } from '@ng-doc/ui-kit/directives/tooltip';
import { WA_LOCATION } from '@ng-web-apis/common';
import { beforeEach, describe, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';
import { provideBrowserLocation } from '../location/browser-location';

@Component({ template: '' })
class EmptyPageComponent {}

@Component({
  selector: 'ng-doc-route-active-host',
  imports: [NgDocRouteActiveDirective],
  template: `
    <a
      class="static"
      [ngDocRouteActive]="link()"
      [activeClass]="activeClass()"
      [matchOptions]="matchOptions()"
      >Docs</a
    >
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class RouteActiveHostComponent {
  readonly link = signal('/docs');
  readonly activeClass = signal<string | string[]>('active');
  readonly matchOptions = signal<IsActiveMatchOptions>({
    fragment: 'exact',
    paths: 'subset',
    queryParams: 'exact',
    matrixParams: 'exact',
  });
}

@Component({
  selector: 'ng-doc-link-host',
  imports: [NgDocLinkComponent],
  template: `<ng-doc-link [path]="path()">Guide</ng-doc-link>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class LinkHostComponent {
  readonly path = signal('/docs/guide');
}

@Component({
  selector: 'ng-doc-tooltip-host',
  imports: [NgDocPageProcessorComponent],
  template: `<div [ngDocPageProcessor]="html"></div>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TooltipHostComponent {
  // Trusted like page content, which the sanitizer would strip the attribute from.
  readonly html = inject(DomSanitizer).bypassSecurityTrustHtml(
    '<p>See <span ngDocTooltip="A hint">this</span></p>',
  );
}

@Component({
  selector: 'ng-doc-heading-anchor-host',
  imports: [NgDocHeadingAnchorComponent],
  template: `<ng-doc-heading-anchor [anchor]="anchor()" [classes]="classes()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HeadingAnchorHostComponent {
  readonly anchor = signal('getting-started');
  readonly classes = signal(['ng-doc-anchor', 'wide']);
}

@Component({
  selector: 'ng-doc-heading-anchor-in-heading-host',
  imports: [NgDocHeadingAnchorComponent],
  template: `
    <h2 id="install">
      Install <code>ng add</code>
      <ng-doc-heading-anchor anchor="install" />
    </h2>
    <h3 aria-label="Custom name">Named<ng-doc-heading-anchor anchor="named" /></h3>
    <div>Not a heading<ng-doc-heading-anchor anchor="none" /></div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HeadingAnchorInHeadingHostComponent {}

/**
 *
 * @param element
 */
function classesOf(element: Element): string[] {
  return Array.from(element.classList).sort();
}

describeChangeDetection('NgDocRouteActiveDirective', ({ providers }) => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideRouter([
          { path: 'docs', children: [{ path: '**', component: EmptyPageComponent }] },
          { path: '**', component: EmptyPageComponent },
        ]),
      ],
    });
  });

  it('is active from the start when the router already matches the link', async () => {
    await TestBed.inject(Router).navigateByUrl('/docs/guide');
    const fixture = TestBed.createComponent(RouteActiveHostComponent);
    await fixture.whenStable();
    const link = fixture.nativeElement.querySelector('a');

    expect(classesOf(link)).toEqual(['active', 'static']);
    expect(getDebugNode(link)?.injector.get(NgDocRouteActiveDirective).isActive()).toBe(true);
  });

  it('follows navigation, the link and the classes', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/api');
    const fixture = TestBed.createComponent(RouteActiveHostComponent);
    await fixture.whenStable();
    const link = fixture.nativeElement.querySelector('a');
    expect(classesOf(link)).toEqual(['static']);

    await router.navigateByUrl('/docs/guide');
    await fixture.whenStable();
    expect(classesOf(link)).toEqual(['active', 'static']);

    fixture.componentInstance.activeClass.set(['one', 'two']);
    await fixture.whenStable();
    expect(classesOf(link)).toEqual(['one', 'static', 'two']);

    fixture.componentInstance.link.set('/api');
    await fixture.whenStable();
    expect(classesOf(link)).toEqual(['static']);

    await router.navigateByUrl('/api?tab=1');
    await fixture.whenStable();
    expect(classesOf(link)).toEqual(['static']);

    fixture.componentInstance.matchOptions.set({
      fragment: 'ignored',
      paths: 'subset',
      queryParams: 'ignored',
      matrixParams: 'ignored',
    });
    await fixture.whenStable();
    expect(classesOf(link)).toEqual(['one', 'static', 'two']);
  });
});

describeChangeDetection('NgDocHeadingAnchorComponent', ({ providers }) => {
  it('copies the link to the heading and sets the host classes', async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        // The copy button renders an icon; its request stays pending.
        provideHttpClient(),
        provideHttpClientTesting(),
        // The link follows the route the browser shows.
        ...provideBrowserLocation('https://ng-doc.test/docs'),
      ],
    });
    const fixture = TestBed.createComponent(HeadingAnchorHostComponent);
    await fixture.whenStable();
    const anchor = fixture.nativeElement.querySelector('ng-doc-heading-anchor');

    const copyButton = fixture.debugElement.query(By.directive(NgDocCopyButtonComponent))
      .componentInstance as NgDocCopyButtonComponent;
    // The link is read when the button is pressed.
    const text = copyButton.text();
    expect(typeof text === 'function' ? text() : text).toBe(
      'https://ng-doc.test/docs#getting-started',
    );
    expect(classesOf(anchor)).toEqual(['ng-doc-anchor', 'wide']);

    fixture.componentInstance.anchor.set('next');
    fixture.componentInstance.classes.set([]);
    await fixture.whenStable();
    const next = copyButton.text();
    expect(typeof next === 'function' ? next() : next).toBe('https://ng-doc.test/docs#next');
    expect(classesOf(anchor)).toEqual([]);
  });
});

describeChangeDetection('NgDocHeadingAnchorComponent in a heading', ({ providers }) => {
  it('keeps its button label out of the heading name', async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WA_LOCATION, useValue: { origin: 'https://ng-doc.test', pathname: '/docs' } },
      ],
    });
    const fixture = TestBed.createComponent(HeadingAnchorInHeadingHostComponent);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    const heading = element.querySelector('h2')!;
    const label = element.querySelector(`#${heading.getAttribute('aria-labelledby')}`)!;

    expect(heading.getAttribute('aria-labelledby')).toBe('ng-doc-heading-label-install');
    expect(label.parentElement).toBe(heading);
    expect(label.textContent?.replace(/\s+/g, ' ').trim()).toBe('Install ng add');
    expect(label.querySelector('code')?.textContent).toBe('ng add');
    expect(label.querySelector('ng-doc-heading-anchor')).toBeNull();
    expect(heading.lastElementChild?.tagName).toBe('NG-DOC-HEADING-ANCHOR');
    expect(element.querySelector('h3')?.getAttribute('aria-label')).toBe('Custom name');
    expect(element.querySelector('h3')?.hasAttribute('aria-labelledby')).toBe(false);
    expect(element.querySelector('div')?.hasAttribute('aria-labelledby')).toBe(false);
    expect(
      Array.from(element.querySelectorAll('ng-doc-heading-anchor button')).map((button) =>
        button.getAttribute('aria-label'),
      ),
    ).toEqual(['Copy link to section', 'Copy link to section', 'Copy link to section']);
  });
});

describeChangeDetection('NgDocLinkComponent', ({ providers }) => {
  it('links to its path', async () => {
    TestBed.configureTestingModule({ providers: [...providers, provideRouter([])] });
    const fixture = TestBed.createComponent(LinkHostComponent);
    await fixture.whenStable();
    const anchor = fixture.nativeElement.querySelector('a');
    expect(anchor.getAttribute('href')).toBe('/docs/guide');
    expect(anchor.textContent.trim()).toBe('Guide');

    fixture.componentInstance.path.set('/api');
    await fixture.whenStable();
    expect(anchor.getAttribute('href')).toBe('/api');
  });
});

describeChangeDetection('tooltipProcessor', ({ providers }) => {
  it('wraps the element and points the tooltip at it', async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        { provide: NG_DOC_PAGE_PROCESSOR, useValue: tooltipProcessor, multi: true },
      ],
    });
    const fixture = TestBed.createComponent(TooltipHostComponent);
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();

    const wrapper = fixture.nativeElement.querySelector('ng-doc-tooltip-wrapper');
    const target = wrapper?.querySelector('span[ngDocTooltip]');
    expect(target?.textContent).toBe('this');
    expect(fixture.nativeElement.querySelectorAll('span[ngDocTooltip]')).toHaveLength(1);

    const projection = wrapper.querySelector('.content-projection');
    const tooltip = getDebugNode(projection)?.injector.get(NgDocTooltipDirective);
    expect(tooltip?.content()).toBe('A hint');
    expect(tooltip?.displayOrigin()).toBe(target);
    expect(tooltip?.pointerOrigin()).toBe(target);
  });
});

describe('NgDoc pipes', () => {
  it('decode URI components and keep invalid ones', () => {
    const pipe = new NgDocDecodeUriComponentPipe();
    expect(pipe.transform('a%20b')).toBe('a b');
    expect(pipe.transform('%E0%A4%A')).toBe('%E0%A4%A');
  });

  it('filter by text', () => {
    const pipe = new NgDocFilterByTextPipe<string>();
    expect(pipe.transform(['a', 'b'], 'b')).toEqual(['b']);
    expect(
      pipe.transform(['alpha', 'beta'], 'al', (item: string, term: string) => item.includes(term)),
    ).toEqual(['alpha']);
  });

  it('trust HTML', () => {
    const pipe = TestBed.runInInjectionContext(() => new NgDocSanitizeHtmlPipe());
    const trusted = pipe.transform('<b>x</b>');
    expect(TestBed.inject(DomSanitizer).sanitize(1, trusted)).toBe('<b>x</b>');
  });
});
