import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  PLATFORM_ID,
  ViewEncapsulation,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NG_DOC_STORE_THEME_KEY } from '@ng-doc/app/constants';

import {
  ɵNG_DOC_DEMO_MESSAGE_SOURCE,
  ɵNgDocDemoBackgroundMessage,
  ɵNgDocDemoSizeMessage,
} from './demo-message';
import { ɵdemoThemeFromFragment } from './demo-theme';

/**
 * The root of the demo application, which shows one demo per page with only Angular and that
 * demo loaded. In an iframe it reports the height of its content to the page that embeds it (a
 * `ResizeObserver` on its border box), and it follows the theme the reader picks on the
 * documentation site, which stores it in `localStorage`, unless its URL fragment sets a theme
 * (`~theme=dark`, the `theme` option of a demo or a playground, or the theme button beside it).
 * In an iframe its page is transparent, so the canvas of the documentation page shows through, and
 * it reports its theme's background, dots and color scheme whenever they change, so that the
 * embedding page can paint the canvas in the demo's own theme.
 */
@Component({
  selector: 'ng-doc-demo-app',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  // `flow-root`: the margins of the demo stay inside the measured box.
  styles: `
    ng-doc-demo-app {
      display: flow-root;
    }

    html.ng-doc-demo-embedded,
    html.ng-doc-demo-embedded body {
      background-color: transparent;
    }
  `,
  // The rules above reach the document and its body, outside this component.
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoAppComponent {
  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    const document = inject(DOCUMENT);
    const window = document.defaultView;
    const destroyRef = inject(DestroyRef);

    if (!window) return;
    const embedded = window.parent !== window;
    let reportedBackground = '';
    // The page's background: the body's, or the document's when the body has none. Reported only
    // when it changes, and once the page has one (its styles may still be loading).
    const reportBackground = () => {
      if (!embedded) return;
      // The theme's background and dots, from its variables: the page itself is transparent in
      // an iframe, so its computed background is not the theme's.
      const style = window.getComputedStyle(document.documentElement);
      const color = style.getPropertyValue('--ng-doc-background').trim();
      const dots = style.getPropertyValue('--ng-doc-base-5').trim();
      // A transparent iframe shows its page only while the iframe element has the page's color
      // scheme; otherwise the browser paints an opaque backdrop behind it.
      const scheme = style.colorScheme && style.colorScheme !== 'normal' ? style.colorScheme : '';
      const key = `${color}|${dots}|${scheme}`;

      if (!color || key === reportedBackground) return;
      reportedBackground = key;
      const message: ɵNgDocDemoBackgroundMessage = {
        source: ɵNG_DOC_DEMO_MESSAGE_SOURCE,
        version: 1,
        type: 'background',
        color,
        ...(dots ? { dots } : {}),
        ...(scheme ? { scheme } : {}),
      };

      window.parent.postMessage(message, window.location.origin);
    };

    if (embedded) {
      // The page is transparent in an iframe, so the canvas of the documentation page, dots and
      // all, shows through around and behind the demo.
      document.documentElement.classList.add('ng-doc-demo-embedded');
      const host: HTMLElement = inject(ElementRef).nativeElement;
      let reported = -1;
      const observer = new ResizeObserver(() => {
        const height = Math.ceil(host.getBoundingClientRect().height);

        // Styles that load after the first report change the background too.
        reportBackground();
        if (height === reported) return;
        reported = height;
        const message: ɵNgDocDemoSizeMessage = {
          source: ɵNG_DOC_DEMO_MESSAGE_SOURCE,
          version: 1,
          type: 'size',
          height,
        };
        // Only a page of the same origin may receive it: the demo pages are part of the site.
        window.parent.postMessage(message, window.location.origin);
      });

      observer.observe(host, { box: 'border-box' });
      destroyRef.onDestroy(() => observer.disconnect());
    }

    // An empty id is the light theme, as in the restore script that applies the stored theme
    // before the application starts; so is `light`, which the `theme` option uses.
    const apply = (theme: string | null) => {
      if (theme && theme !== 'light') {
        document.documentElement.setAttribute('data-theme', theme);
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      reportBackground();
    };
    const pinned = () => ɵdemoThemeFromFragment(window.location.hash);
    const site = () => {
      try {
        return window.localStorage.getItem(NG_DOC_STORE_THEME_KEY);
      } catch {
        return null;
      }
    };
    // The documentation page and the demo page share the origin, so a theme the reader picks
    // reaches this page as a storage event; a theme of the fragment wins over it.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== NG_DOC_STORE_THEME_KEY || event.newValue === null || pinned()) return;
      apply(event.newValue);
    };
    // The documentation page changes the fragment with `location.replace`, without a reload.
    const onHashChange = () => apply(pinned() ?? site());

    // The `auto` theme follows the system's color scheme.
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');

    if (pinned()) apply(pinned()!);
    reportBackground();
    window.addEventListener('storage', onStorage);
    window.addEventListener('hashchange', onHashChange);
    scheme?.addEventListener?.('change', reportBackground);
    destroyRef.onDestroy(() => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('hashchange', onHashChange);
      scheme?.removeEventListener?.('change', reportBackground);
    });
  }
}
