import '@angular/compiler';

import { APP_BASE_HREF } from '@angular/common';
import { Component } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
import { provideRouter } from '@angular/router';
// This acceptance suite renders the app runtime's page link, which the builder never imports.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { NgDocPageLinkComponent } from '@ng-doc/app/components/page-link/page-link.component';
import { describe, expect, it } from 'vitest';

const origin = 'http://ng-localhost';
const currentPath = '/preview/docs/current';

@Component({
  selector: 'ng-doc-runtime-link-probe',
  standalone: true,
  imports: [NgDocPageLinkComponent],
  template: `
    <ng-doc-page-link #fragmentLink classes="fragment" href="#anchor">fragment</ng-doc-page-link>
    <ng-doc-page-link classes="unicode-fragment" href="#unicode-привет"
      >unicode fragment</ng-doc-page-link
    >
    <ng-doc-page-link #queryLink classes="query" href="?mode=compact">query</ng-doc-page-link>
    <ng-doc-page-link classes="logical" href="docs/foo">logical</ng-doc-page-link>
    <ng-doc-page-link classes="root-relative" href="/docs/root">root</ng-doc-page-link>
    <ng-doc-page-link classes="encoded-logical" href="docs/space%20name"
      >encoded logical</ng-doc-page-link
    >
    <ng-doc-page-link classes="encoded-slash" href="docs/a%2Fb">encoded slash</ng-doc-page-link>
    <ng-doc-page-link classes="encoded-absolute" href="${origin}/preview/docs/space%20name"
      >encoded absolute</ng-doc-page-link
    >
    <ng-doc-page-link classes="malformed-escape" href="docs/%ZZ">malformed escape</ng-doc-page-link>
    <ng-doc-page-link classes="base-root" href="${origin}/preview">base root</ng-doc-page-link>
    <ng-doc-page-link classes="same-origin" href="${origin}/preview/docs/already"
      >same</ng-doc-page-link
    >
    <ng-doc-page-link classes="near-base" href="${origin}/preview-other/docs/nope"
      >near base</ng-doc-page-link
    >
    <ng-doc-page-link classes="outside-base" href="${origin}/outside">outside</ng-doc-page-link>
    <ng-doc-page-link classes="mail" href="mailto:docs@example.test">mail</ng-doc-page-link>
    <ng-doc-page-link classes="external" href="https://external.example/path"
      >external</ng-doc-page-link
    >
    <output class="public-getters"
      >{{ fragmentLink.fragment() }}|{{ queryLink.queryParams()['mode'] }}|{{
        queryLink.fragment() ?? 'none'
      }}</output
    >
  `,
})
class RuntimeLinkProbe {}

@Component({ selector: 'ng-doc-empty-route', standalone: true, template: '' })
class EmptyRoute {}

describe('NgDocPageLinkComponent real Angular Router SSR', () => {
  it('renders browser-equivalent URLs under a non-root application base', async () => {
    const html = await render();

    expect(href(html, 'fragment')).toBe('/preview/docs/current?existing=1#anchor');
    expect(href(html, 'unicode-fragment')).toBe(
      '/preview/docs/current?existing=1#unicode-%D0%BF%D1%80%D0%B8%D0%B2%D0%B5%D1%82',
    );
    expect(href(html, 'query')).toBe('/preview/docs/current?mode=compact');
    expect(href(html, 'logical')).toBe('/preview/docs/foo');
    expect(href(html, 'root-relative')).toBe('/preview/docs/root');
    expect(href(html, 'encoded-logical')).toBe('/preview/docs/space%20name');
    expect(href(html, 'encoded-slash')).toBe('/preview/docs/a%2Fb');
    expect(href(html, 'encoded-absolute')).toBe('/preview/docs/space%20name');
    expect(href(html, 'malformed-escape')).toBe('/preview/docs/%25ZZ');
    expect(href(html, 'base-root')).toBe('/preview/');
    expect(href(html, 'same-origin')).toBe('/preview/docs/already');
    expect(href(html, 'near-base')).toBe(`${origin}/preview-other/docs/nope`);
    expect(href(html, 'outside-base')).toBe(`${origin}/outside`);
    expect(href(html, 'mail')).toBe('mailto:docs@example.test');
    expect(href(html, 'external')).toBe('https://external.example/path');
    expect(html).toContain('<output class="public-getters">anchor|compact|none</output>');
  });

  it('does not mistake a generated logical route segment for the application base', async () => {
    const html = await render('/docs/', '/docs/current');

    expect(href(html, 'logical')).toBe('/docs/docs/foo');
    expect(href(html, 'root-relative')).toBe('/docs/docs/root');
  });

  it('normalizes a root application base using Angular Router behavior', async () => {
    const html = await render('/', '/docs/current');

    expect(href(html, 'fragment')).toBe('/docs/current?existing=1#anchor');
    expect(href(html, 'logical')).toBe('/docs/foo');
  });

  it('uses native anchors only for external or same-origin outside-base absolute URLs', async () => {
    const html = await render();

    expect(anchor(html, 'outside-base')).not.toContain('target="_blank"');
    expect(anchor(html, 'outside-base')).not.toContain('ng-doc-icon');
    expect(anchor(html, 'mail')).toContain('target="_blank"');
    expect(anchor(html, 'external')).toContain('target="_blank"');
  });
});

function render(baseHref: string = '/preview/', pagePath: string = currentPath): Promise<string> {
  return renderApplication(
    (context) =>
      bootstrapApplication(
        RuntimeLinkProbe,
        {
          providers: [
            provideServerRendering(),
            provideRouter([{ path: '**', component: EmptyRoute }]),
            { provide: APP_BASE_HREF, useValue: baseHref },
          ],
        },
        context,
      ),
    {
      document: `<!doctype html><html><head><base href="${baseHref}"></head><body><ng-doc-runtime-link-probe></ng-doc-runtime-link-probe></body></html>`,
      url: `${origin}${pagePath}?existing=1`,
      allowedHosts: ['ng-localhost'],
    },
  );
}

function href(html: string, classes: string): string {
  const match = anchor(html, classes).match(/\shref="([^"]*)"/);
  expect(match, `Missing href for ${classes}`).not.toBeNull();

  return match?.[1]?.replaceAll('&amp;', '&') ?? '';
}

function anchor(html: string, classes: string): string {
  const match = html.match(new RegExp(`<a[^>]*class="${classes}"[^>]*>.*?</a>`, 's'));
  expect(match, `Missing anchor for ${classes}`).not.toBeNull();

  return match?.[0] ?? '';
}
