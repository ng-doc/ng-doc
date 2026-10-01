import '@angular/compiler';

import { APP_BASE_HREF } from '@angular/common';
import {
  type EnvironmentProviders,
  type Provider,
  Component,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideServerRendering, renderApplication } from '@angular/platform-server';
// This acceptance suite renders the ui-kit runtime token, which the builder never imports.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { NG_REQUEST_BASE_PATH } from '@ng-doc/ui-kit/tokens/base-path';
import { describe, expect, it } from 'vitest';

const ASSET_PATH = 'assets/ng-doc/reference/api-list.json';

@Component({
  selector: 'ng-doc-base-path-probe',
  standalone: true,
  template: '<output id="base">{{ basePath }}</output><output id="asset">{{ assetUrl }}</output>',
})
class BasePathProbe {
  readonly basePath = inject(NG_REQUEST_BASE_PATH);
  readonly assetUrl = `${this.basePath}${ASSET_PATH}`;
}

describe('NG_REQUEST_BASE_PATH real Angular SSR', () => {
  it('keeps root SSR asset requests absolute', async () => {
    const html = await render({ appBaseHref: '/', documentBaseHref: '/' });

    expect(html).toContain('<output id="base">/</output>');
    expect(html).toContain(`<output id="asset">/${ASSET_PATH}</output>`);
  });

  it('uses APP_BASE_HREF without a DOM base and adds one trailing separator', async () => {
    const withoutSeparator = await render({
      appBaseHref: '/preview',
      url: 'http://ng-localhost/preview/docs/outer/inner/reference',
    });
    const withSeparator = await render({
      appBaseHref: '/preview/',
    });

    for (const html of [withoutSeparator, withSeparator]) {
      expect(html).toContain('<output id="base">/preview/</output>');
      expect(html).toContain(`<output id="asset">/preview/${ASSET_PATH}</output>`);
      expect(html).not.toContain('/preview//assets');
    }
  });

  it('prefers the DOM base when routing and browser asset bases differ', async () => {
    const html = await render({
      appBaseHref: '/routing-only/',
      documentBaseHref: '/browser-assets/',
    });

    expect(html).toContain('<output id="base">/browser-assets/</output>');
    expect(html).toContain(`<output id="asset">/browser-assets/${ASSET_PATH}</output>`);
  });

  it('falls back to the public DOM base href and ignores its query or fragment', async () => {
    const html = await render({ documentBaseHref: '/preview/docs?mode=ssr#top' });

    expect(html).toContain('<output id="base">/preview/</output>');
    expect(html).toContain(`<output id="asset">/preview/${ASSET_PATH}</output>`);
  });

  it('resolves relative and cross-origin DOM bases with document URL semantics', async () => {
    const documentUrl = 'http://ng-localhost/preview/docs/reference';
    const relativeFile = await render({
      documentBaseHref: '../shared',
      url: documentUrl,
    });
    const relativeDirectory = await render({
      documentBaseHref: '../shared/',
      url: documentUrl,
    });
    const crossOrigin = await render({
      documentBaseHref: 'https://cdn.example/ng-doc',
      url: documentUrl,
    });

    expect(relativeFile).toContain(
      `<output id="asset">${domAssetUrl('../shared', documentUrl)}</output>`,
    );
    expect(relativeDirectory).toContain(
      `<output id="asset">${domAssetUrl('../shared/', documentUrl)}</output>`,
    );
    expect(crossOrigin).toContain(
      `<output id="asset">${domAssetUrl('https://cdn.example/ng-doc', documentUrl)}</output>`,
    );
  });

  it('keeps the legacy server root when neither Angular nor the document supplies a base', async () => {
    const html = await render({});

    expect(html).toContain('<output id="base">/</output>');
    expect(html).toContain(`<output id="asset">/${ASSET_PATH}</output>`);
  });

  it('honors an explicit NG_REQUEST_BASE_PATH provider without applying factory normalization', async () => {
    const html = await render({
      appBaseHref: '/preview/',
      documentBaseHref: '/preview/',
      requestBasePath: '/tenant/custom/',
    });

    expect(html).toContain('<output id="base">/tenant/custom/</output>');
    expect(html).toContain(`<output id="asset">/tenant/custom/${ASSET_PATH}</output>`);
  });

  it('preserves browser-relative request behavior', async () => {
    const html = await render({ appBaseHref: '/preview/', platformId: 'browser' });

    expect(html).toContain('<output id="base"></output>');
    expect(html).toContain(`<output id="asset">${ASSET_PATH}</output>`);
  });
});

interface RenderOptions {
  appBaseHref?: string;
  documentBaseHref?: string;
  requestBasePath?: string;
  platformId?: string;
  url?: string;
}

function domAssetUrl(baseHref: string, documentUrl: string): string {
  const documentLocation = new URL(documentUrl);
  const asset = new URL(ASSET_PATH, new URL(baseHref, documentLocation));

  return asset.origin === documentLocation.origin ? asset.pathname : asset.href;
}

function render(options: RenderOptions): Promise<string> {
  const providers: Array<Provider | EnvironmentProviders> = [provideServerRendering()];
  if (options.appBaseHref !== undefined) {
    providers.push({ provide: APP_BASE_HREF, useValue: options.appBaseHref });
  }
  if (options.requestBasePath !== undefined) {
    providers.push({ provide: NG_REQUEST_BASE_PATH, useValue: options.requestBasePath });
  }
  if (options.platformId !== undefined) {
    providers.push({ provide: PLATFORM_ID, useValue: options.platformId });
  }
  const base =
    options.documentBaseHref === undefined
      ? ''
      : `<base href="${options.documentBaseHref.replaceAll('"', '&quot;')}">`;

  return renderApplication(
    (context) => bootstrapApplication(BasePathProbe, { providers }, context),
    {
      document: `<!doctype html><html><head>${base}</head><body><ng-doc-base-path-probe></ng-doc-base-path-probe></body></html>`,
      url: options.url ?? 'http://ng-localhost/',
      allowedHosts: ['ng-localhost'],
    },
  );
}
