import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NgDocPageLinkComponent } from '@ng-doc/app/components/page-link';
import { beforeEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

@Component({
  selector: 'ng-doc-code-link-host',
  imports: [NgDocPageLinkComponent],
  template: `<code
    ><ng-doc-page-link href="https://example.com/docs">docs</ng-doc-page-link></code
  >`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CodeLinkHostComponent {}

describeChangeDetection('NgDocPageLinkComponent', ({ providers }) => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...providers, provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  /**
   * Renders a page link.
   * @param href - The link target.
   * @returns The rendered anchor and the component.
   */
  async function render(
    href: string,
  ): Promise<{ anchor: HTMLAnchorElement; link: NgDocPageLinkComponent }> {
    const fixture = TestBed.createComponent(NgDocPageLinkComponent);

    fixture.componentRef.setInput('href', href);
    fixture.componentRef.setInput('classes', 'my-link');
    fixture.detectChanges();
    await fixture.whenStable();

    return { anchor: fixture.nativeElement.querySelector('a'), link: fixture.componentInstance };
  }

  it('navigates inside the application with the router', async () => {
    const { anchor, link } = await render('/docs/page?tab=api#usage');

    expect(anchor.getAttribute('href')).toBe('/docs/page?tab=api#usage');
    expect(anchor.className).toBe('my-link');
    expect(anchor.getAttribute('target')).toBeNull();
    expect(link.isExternalLink()).toBe(false);
    expect(link.path()).toBe('/docs/page');
    expect(link.fragment()).toBe('usage');
    expect(link.queryParams()).toEqual({ tab: 'api' });
  });

  it('opens other origins in a new tab with an external-link icon', async () => {
    const { anchor, link } = await render('https://example.com/docs');

    expect(anchor.getAttribute('href')).toBe('https://example.com/docs');
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(anchor.querySelector('ng-doc-icon')).not.toBeNull();
    expect(link.isExternalLink()).toBe(true);
  });

  it('shows no icon on an external link inside code', async () => {
    const fixture = TestBed.createComponent(CodeLinkHostComponent);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('a[target="_blank"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('ng-doc-icon')).toBeNull();
  });
});
