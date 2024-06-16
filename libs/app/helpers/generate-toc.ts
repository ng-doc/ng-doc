import { NgDocTocItem } from '@ng-doc/app/interfaces';
import { asArray } from '@ng-doc/core/helpers/as-array';
import { NgDocHeading } from '@ng-doc/core/types';

/**
 * Generate table of contents, only for headings with id
 * @param container
 * @param headings
 */
export function generateToc(container: HTMLElement): NgDocTocItem[] {
  const headings: NgDocHeading[] = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

  const headingElements: HTMLHeadingElement[] = Array.from(
    container.querySelectorAll<HTMLHeadingElement>(headings.join(', ')),
  ).filter((heading: HTMLHeadingElement) => heading.id);

  const levels: number[] = asArray(new Set(headingElements.map(levelFromTagName).sort()));

  return headingElements.reduce((map: NgDocTocItem[], heading: HTMLHeadingElement) => {
    const headingLevel: number = levelFromTagName(heading);
    const anchor: HTMLAnchorElement | null =
      heading.querySelector<HTMLAnchorElement>('a.ng-doc-header-link');

    if (anchor) {
      map.push({
        title: heading.textContent?.trim() ?? '',
        element: heading,
        path: anchor.pathname,
        hash: anchor.hash.replace('#', ''),
        level: levels.indexOf(headingLevel) + 1,
      });
    }

    return map;
  }, []);
}

/**
 *
 * @param heading
 */
function levelFromTagName(heading: HTMLHeadingElement): number {
  return Number(heading.tagName.toLowerCase().replace(/[a-z]*/g, '') || 1);
}
