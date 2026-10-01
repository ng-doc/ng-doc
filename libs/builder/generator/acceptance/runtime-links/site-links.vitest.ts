import GithubSlugger from 'github-slugger';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The documentation site's header, landing page and fallback routes link to guide pages by URL.
// The URL of a guide page is its folder under `docs/`, so a page that moves or is renamed breaks
// these links without any build error. This spec reads the literal routes and checks that each one
// has a page (or, for the header's section matching, a category). The runtime libraries link to
// ng-doc.com in their messages the same way, anchors included.
const repository = join(import.meta.dirname, '../../../../..');
const site = join(repository, 'apps/ng-doc');
const app = join(site, 'src/app');
const docs = join(site, 'docs');
const sources = [
  'app.component.html',
  'app.component.ts',
  'app.config.ts',
  'pages/landing/landing.component.html',
  'pages/landing/landing.component.ts',
];

/**
 * Reads the literal `docs/...` routes of a source file of the site.
 * @param source - The file, relative to `apps/ng-doc/src/app`.
 * @returns The routes, without a leading slash.
 */
function docsRoutes(source: string): string[] {
  const text = readFileSync(join(app, source), 'utf8');

  return [...text.matchAll(/['"]\/?(docs\/[a-z0-9/-]+)['"]/g)].map(([, route]) => route);
}

/**
 * Whether a route has a guide page, a category or the API index behind it.
 * @param route - The route, without a leading slash.
 * @returns `true` when the route resolves.
 */
function exists(route: string): boolean {
  const page = route.replace(/^docs\/?/, '');

  // `docs/api` is the generated API index; every other route is a guide page or category folder.
  return (
    page === 'api' ||
    existsSync(join(docs, page, 'ng-doc.page.ts')) ||
    existsSync(join(docs, page, 'ng-doc.category.ts'))
  );
}

/**
 * The heading anchors of a guide page: the slugs of the headings of every Markdown file in its
 * folder, as the renderer builds them (GitHub slugs of the heading text).
 * @param route - The route, without a leading slash.
 * @returns The anchors.
 */
function anchors(route: string): Set<string> {
  const folder = join(docs, route.replace(/^docs\/?/, ''));
  const slugs = new Set<string>();

  for (const file of readdirSync(folder).filter((name) => name.endsWith('.md'))) {
    const slugger = new GithubSlugger();
    const markdown = readFileSync(join(folder, file), 'utf8').replace(/```[\s\S]*?```/g, '');

    for (const [, heading] of markdown.matchAll(/^#{1,6}\s+(.+)$/gm)) {
      slugs.add(slugger.slug(heading.replace(/`/g, '').trim()));
    }
  }

  return slugs;
}

/**
 * Lists the runtime sources of a library: its TypeScript and HTML files outside specs and tests.
 * @param directory - The directory to scan.
 * @returns The absolute file paths.
 */
function runtimeSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);

    if (entry.isDirectory()) {
      return ['node_modules', 'testing'].includes(entry.name) ? [] : runtimeSources(file);
    }

    return /\.(ts|html)$/.test(entry.name) && !/\.spec\.ts$/.test(entry.name) ? [file] : [];
  });
}

/**
 * The links to ng-doc.com guide pages in the runtime libraries, such as error messages.
 * @returns Each link with the file that holds it.
 */
function libraryLinks(): Array<{ file: string; route: string; anchor?: string }> {
  return ['libs/app', 'libs/ui-kit'].flatMap((library) =>
    runtimeSources(join(repository, library)).flatMap((file) =>
      [
        ...readFileSync(file, 'utf8').matchAll(
          /https:\/\/ng-doc\.com\/(docs\/[a-z0-9/-]+)(?:#([\w-]+))?/g,
        ),
      ].map(([, route, anchor]) => ({ file: relative(repository, file), route, anchor })),
    ),
  );
}

/**
 * A heading that opens with an emoji: the emoji and the separator after it. The emoji is
 * decorative, so it must not change the heading's anchor.
 */
const LEADING_EMOJI =
  /^(?:\p{Regional_Indicator}{2}|(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F)(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic}\uFE0F?)*)(\s)/u;

/**
 * Every Markdown heading of the docs that opens with an emoji.
 * @returns Each heading with its file, relative to `apps/ng-doc/docs`.
 */
function emojiHeadings(): Array<{ file: string; heading: string; separator: string }> {
  const files = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = join(directory, entry.name);

      return entry.isDirectory() ? files(file) : entry.name.endsWith('.md') ? [file] : [];
    });

  return files(docs).flatMap((file) =>
    [
      ...readFileSync(file, 'utf8')
        .replace(/```[\s\S]*?```/g, '')
        .matchAll(/^#{1,6}\s+(.+)$/gm),
    ].flatMap(([, heading]) => {
      const match = LEADING_EMOJI.exec(heading);

      return match ? [{ file: relative(docs, file), heading, separator: match[1] }] : [];
    }),
  );
}

describe('site links', () => {
  it.each(sources)('%s links only to existing pages', (source) => {
    const routes = docsRoutes(source);

    expect(routes.filter((route) => !exists(route))).toEqual([]);
  });

  it('runtime library messages link to existing pages and headings', () => {
    const links = libraryLinks();
    const broken = links
      .filter(({ route, anchor }) => !exists(route) || (anchor && !anchors(route).has(anchor)))
      .map(({ file, route, anchor }) => `${file}: ${route}${anchor ? `#${anchor}` : ''}`);

    expect(links.length).toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });

  it('reads the heading anchors the renderer builds', () => {
    expect([...anchors('docs/get-started/installation')]).toEqual(
      expect.arrayContaining(['manual-setup', '3-map-ng-docgenerated', '4-add-the-providers']),
    );
  });

  it('finds the header and landing links', () => {
    expect(docsRoutes('app.component.html')).toEqual([
      'docs/get-started/introduction',
      'docs/api',
      'docs/upgrade/upgrade-to-22',
    ]);
    expect(docsRoutes('pages/landing/landing.component.ts').length).toBeGreaterThan(10);
  });

  it('redirects the docs root and unknown URLs to an existing page', () => {
    const redirects = ['pages/docs/docs.routes.ts', 'app.config.ts'].flatMap((source) =>
      [...readFileSync(join(app, source), 'utf8').matchAll(/redirectTo: '([^']+)'/g)].map(
        ([, target]) => target,
      ),
    );

    expect(redirects).toEqual(['get-started/installation', 'docs/get-started/installation']);
    expect(
      redirects.filter((target) => !exists(target.startsWith('docs/') ? target : `docs/${target}`)),
    ).toEqual([]);
  });
  // GitHub slugs keep a space as a hyphen, so `🚀 Start here` would become `-start-here`. The docs
  // separate a heading emoji with a no-break space, which the slugger drops. An editor or formatter
  // that turns it into a plain space would silently break every link to the heading.
  it('keeps the anchor of every heading that opens with an emoji', () => {
    const headings = emojiHeadings();
    const changed = headings
      .filter(({ heading }) => {
        const slug = new GithubSlugger().slug(heading.replace(/`/g, '').trim());
        const plain = heading.replace(LEADING_EMOJI, '');

        return slug !== new GithubSlugger().slug(plain.replace(/`/g, '').trim());
      })
      .map(({ file, heading }) => `${file}: ${heading}`);

    expect(headings.length).toBeGreaterThan(0);
    expect(headings.filter(({ separator }) => separator !== '\u00a0')).toEqual([]);
    expect(changed).toEqual([]);
  });

  it('keeps the known anchors of the emoji headings', () => {
    const known: Record<string, string[]> = {
      'docs/get-started/introduction': ['what-ngdoc-can-do', 'start-here'],
      'docs/get-started/installation': ['add-ngdoc', 'start-the-site'],
      'docs/get-started/your-first-page': ['next-steps'],
      'docs/get-started/how-ng-doc-works': ['the-pipeline'],
      'docs/customize/themes-and-colors': ['custom-theme'],
      'docs/demos-and-playgrounds/playgrounds': ['inputs-and-controls'],
      'docs/write-content/links-and-keywords': ['global-keywords'],
      'docs/build-and-deploy/performance-and-caching': ['what-keeps-edits-fast'],
      'docs/build-and-deploy/production-builds-and-prerendering': ['hosting'],
      'docs/upgrade/upgrade-to-22': ['next-steps'],
    };

    const missing = Object.entries(known).flatMap(([route, expected]) =>
      expected
        .filter((anchor) => !anchors(route).has(anchor))
        .map((anchor) => `${route}#${anchor}`),
    );

    expect(missing).toEqual([]);
  });
});
