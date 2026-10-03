import { Clipboard } from '@angular/cdk/clipboard';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  NgZone,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { TileComponent, TileHue } from './tile/tile.component';

/** A feature of the showcase, linked to the page that explains it. */
interface LandingFeature {
  heading: string;
  /** A decorative emoji after the heading, hidden from assistive technology. */
  emoji?: string;
  description: string;
  more: string;
  route: string;
  hue: TileHue;
  /** SVG path data of the 24px icon. */
  icon: string;
  wide?: boolean;
}

/** A link of the footer. */
interface LandingLink {
  label: string;
  route?: string;
  href?: string;
}

/** A row of the API reference sample. */
interface LandingApiRow {
  name: string;
  kind: string;
  hue: TileHue;
}

const INSTALL_COMMAND = 'ng add @ng-doc/add';

/**
 * The landing page of the NgDoc site: the hero with a live-looking docs page, the feature
 * showcase, how a page is made, the first steps, the API reference, a call to action and the
 * footer. Everything is built from NgDoc's tokens; no external media is loaded.
 */
@Component({
  selector: 'ng-doc-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss', './landing-content.scss', './landing-sections.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The code samples are bound as HTML, which emulated encapsulation would not style; every rule
  // is scoped under the component's element instead.
  encapsulation: ViewEncapsulation.None,
  imports: [RouterLink, TileComponent],
})
export class LandingComponent {
  protected readonly installCommand = INSTALL_COMMAND;
  protected readonly year = new Date().getFullYear();
  protected readonly installCopied = signal(false);

  protected readonly features: LandingFeature[] = [
    {
      heading: 'Markdown + Nunjucks',
      emoji: '📝',
      description:
        'Write guides in Markdown and reuse content with includes, macros and template logic.',
      more: 'Templates',
      route: '/docs/write-content/templates',
      hue: 'brand',
      icon: 'M4 5h16M4 10h16M4 15h10M4 20h7',
    },
    {
      heading: 'API docs from your code',
      emoji: '📚',
      description:
        'Classes, components, interfaces and functions documented from TypeScript and JSDoc, with no duplicate writing.',
      more: 'API pages',
      route: '/docs/document-your-api/generate-api-pages',
      hue: 'violet',
      icon: 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16',
    },
    {
      heading: 'Demos and demo panes',
      emoji: '🧩',
      description:
        'Render any Angular component on a page with one line, with its source shown next to it.',
      more: 'Demos',
      route: '/docs/demos-and-playgrounds/demos',
      hue: 'green',
      icon: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 21h8M12 18v3',
    },
    {
      heading: 'Playgrounds',
      emoji: '🧪',
      description:
        'Controls generated from your component inputs let readers try every option live.',
      more: 'Playgrounds',
      route: '/docs/demos-and-playgrounds/playgrounds',
      hue: 'amber',
      icon: 'M4 6h10m4 0h2M4 12h4m4 0h8M4 18h12M16 4v4M8 10v4M18 16v4',
    },
    {
      heading: 'Offline full-text search',
      emoji: '🔍',
      description:
        'Guides and API are indexed at build time, so search works without a hosted service.',
      more: 'Search',
      route: '/docs/customize/search-and-command-palette',
      hue: 'brand',
      icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-3.5-3.5',
    },
    {
      heading: 'Keywords and auto-linking',
      emoji: '🔗',
      description:
        'Mention a declaration anywhere, even inside code blocks, and it links to its API page.',
      more: 'Links and keywords',
      route: '/docs/write-content/links-and-keywords',
      hue: 'violet',
      icon: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    },
    {
      heading: 'Themeable, replaceable',
      emoji: '🎨',
      description:
        'CSS variables for colours, type and layout; swap the navbar or sidebar for your own components.',
      more: 'Themes and colors',
      route: '/docs/customize/themes-and-colors',
      hue: 'neutral',
      icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 3v18',
    },
    {
      heading: 'SSR-ready, rebuilt as you type',
      emoji: '🚀',
      description:
        'Prerender to static HTML for fast loads and SEO. In development NgDoc watches your docs and API sources and rebuilds only what changed.',
      more: 'Prerendering',
      route: '/docs/build-and-deploy/production-builds-and-prerendering',
      hue: 'green',
      icon: 'M13 2 4 14h7l-1 8 9-12h-7z',
      wide: true,
    },
  ];

  protected readonly steps: Array<{ heading: string; description: string; code: string }> = [
    {
      heading: 'Add NgDoc',
      description:
        'The schematic installs the packages and configures the builder for Angular CLI or Nx.',
      code: INSTALL_COMMAND,
    },
    {
      heading: 'Create a page',
      description:
        'Add a folder with a page config and Markdown next to your code, or let NgDoc scan your API.',
      code: 'docs/button/\n  ng-doc.page.ts\n  index.md',
    },
    {
      heading: 'Serve and ship',
      description:
        'Run the dev server while you write, then build or prerender for any static host.',
      code: 'ng serve\nng build',
    },
  ];

  protected readonly apiRows: LandingApiRow[] = [
    { name: 'NgDocCodeComponent', kind: 'Component', hue: 'brand' },
    { name: 'NgDocThemeService', kind: 'Injectable', hue: 'violet' },
    { name: 'NgDocSidebarComponent', kind: 'Component', hue: 'brand' },
    { name: 'provideNgDocApp', kind: 'Function', hue: 'green' },
    { name: 'NgDocCustomNavbarDirective', kind: 'Directive', hue: 'brand' },
    { name: 'NgDocPage', kind: 'Interface', hue: 'neutral' },
    { name: 'NgDocDefaultSearchEngine', kind: 'Class', hue: 'violet' },
    { name: 'NG_DOC_DEFAULT_PAGE_PROCESSORS', kind: 'Variable', hue: 'amber' },
  ];

  protected readonly footerColumns: Array<{ title: string; links: LandingLink[] }> = [
    {
      title: 'Docs',
      links: [
        { label: 'Get started', route: '/docs/get-started/installation' },
        { label: 'Write content', route: '/docs/write-content/pages-and-categories' },
        { label: 'Document your API', route: '/docs/document-your-api/generate-api-pages' },
        { label: 'Customize', route: '/docs/customize/themes-and-colors' },
      ],
    },
    {
      title: 'Reference',
      links: [
        { label: 'API References', route: '/docs/api' },
        { label: 'Configuration', route: '/docs/reference/configuration' },
        { label: 'Migrations', route: '/docs/upgrade/upgrade-to-22' },
      ],
    },
    {
      title: 'Community',
      links: [
        { label: 'GitHub', href: 'https://github.com/ng-doc/ng-doc' },
        { label: 'Issues', href: 'https://github.com/ng-doc/ng-doc/issues' },
        {
          label: 'Contributing',
          href: 'https://github.com/ng-doc/ng-doc/blob/main/CONTRIBUTING.md',
        },
      ],
    },
  ];

  // The code samples are static, pre-highlighted markup: the tokens use the syntax colours, and
  // the Nunjucks braces would otherwise need escaping in the template.
  protected readonly markdownSample: string = [
    line('<span class="k"># {{ NgDocPage.title }}</span>'),
    line(' '),
    line('A button is an interface element that allows'),
    line('the user to perform an action when clicked.'),
    line(' '),
    line('<span class="c">{% include "../shared/import-note.md" %}</span>'),
    line(' '),
    line('<span class="f">{{ NgDocActions.demo("ButtonDemoComponent") }}</span>', true),
    line(' '),
    line('Configure it with <span class="s">`ButtonComponent`</span> inputs.'),
  ].join('');

  protected readonly heroSample: string = line(
    '<span class="t">&lt;button</span> <span class="f">myButton</span> <span class="f">color</span>=<span class="s">"primary"</span><span class="t">&gt;</span>Save<span class="t">&lt;/button&gt;</span>',
  );

  private readonly clipboard = inject(Clipboard);
  private readonly ngZone = inject(NgZone);
  private copiedTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.copiedTimer));
  }

  /**
   * Copies the install command.
   */
  protected copyInstallCommand(): void {
    this.clipboard.copy(INSTALL_COMMAND);
    this.installCopied.set(true);
    clearTimeout(this.copiedTimer);
    // The label timer must not hold the application unstable, so it runs outside the zone.
    this.copiedTimer = this.ngZone.runOutsideAngular(() =>
      setTimeout(() => this.installCopied.set(false), 1400),
    );
  }
}

/**
 * Wraps one line of a code sample.
 * @param html - The highlighted line.
 * @param highlighted - Whether the line is highlighted.
 * @returns The line markup.
 */
function line(html: string, highlighted: boolean = false): string {
  return `<span class="l${highlighted ? ' hl' : ''}">${html}</span>`;
}
