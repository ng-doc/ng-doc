import {
  ɵcaptureNgDocHydrationSnapshots,
  ɵrestoreNgDocHydrationSnapshot,
} from '@ng-doc/app/helpers';
import { afterEach, describe, expect, it } from 'vitest';

describe('NgDoc hydration snapshots', () => {
  afterEach(() => (document.body.innerHTML = ''));

  function serverRendered(
    tag: string,
    html: string,
    skip: boolean = true,
    async: boolean = true,
  ): HTMLElement {
    const host = document.createElement(tag);

    if (skip) host.setAttribute('ngskiphydration', 'true');
    if (async) host.setAttribute('data-ng-doc-async-content', '');
    host.innerHTML = html;
    document.body.appendChild(host);

    return host;
  }

  it('shows the server-rendered content of a skipped host until it is released', () => {
    const host = serverRendered('ng-doc-page', '<div class="body"><h2>Section</h2>Text</div>');

    ɵcaptureNgDocHydrationSnapshots(document);
    // Angular empties the host, then renders the component's own (not yet loaded) content.
    host.innerHTML = '<div class="ng-doc-page-wrapper"></div>';

    const release = ɵrestoreNgDocHydrationSnapshot(host);
    const copy = host.firstElementChild as HTMLElement;

    expect(copy.className).toBe('ng-doc-hydration-snapshot');
    expect(copy.style.display).toBe('contents');
    expect(copy.innerHTML).toBe('<div class="body"><h2>Section</h2>Text</div>');
    expect(host.hasAttribute('data-ng-doc-hydration-snapshot')).toBe(true);
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(copy.hasAttribute('inert')).toBe(true);
    expect(host.textContent).toBe('SectionText');

    release();

    expect(host.innerHTML).toBe('<div class="ng-doc-page-wrapper"></div>');
    expect(host.hasAttribute('data-ng-doc-hydration-snapshot')).toBe(false);
    expect(host.hasAttribute('aria-busy')).toBe(false);
    // Later calls do nothing, even when the host shows its own state again.
    host.setAttribute('aria-busy', 'true');
    release();
    expect(host.getAttribute('aria-busy')).toBe('true');
    expect(host.innerHTML).toBe('<div class="ng-doc-page-wrapper"></div>');
  });

  it('keeps a copy, not the nodes Angular removes, and shows it once', () => {
    const host = serverRendered('ng-doc-page-header', '<header><h1>Title</h1></header>');
    const original = host.firstChild;

    ɵcaptureNgDocHydrationSnapshots(document);
    expect(host.firstChild).toBe(original);
    host.replaceChildren();

    const release = ɵrestoreNgDocHydrationSnapshot(host);

    expect(host.querySelector('h1')?.textContent).toBe('Title');
    expect(host.querySelector('header')).not.toBe(original);
    release();
    ɵrestoreNgDocHydrationSnapshot(host);
    expect(host.childNodes.length).toBe(0);
  });

  it('copies only skipped NgDoc hosts that hold content', () => {
    const hydrated = serverRendered('ng-doc-page', '<p>Hydrated</p>', false);
    const empty = serverRendered('ng-doc-page', '');
    const other = serverRendered('ng-doc-demo', '<p>Demo</p>');

    ɵcaptureNgDocHydrationSnapshots(document);
    for (const host of [hydrated, empty, other]) host.replaceChildren();

    for (const host of [hydrated, empty, other]) {
      ɵrestoreNgDocHydrationSnapshot(host)();
      expect(host.childNodes.length).toBe(0);
      expect(host.hasAttribute('data-ng-doc-hydration-snapshot')).toBe(false);
    }
  });
});
