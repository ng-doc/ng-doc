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
    const isHeadingLink = heading.getAttribute('headingLink') === 'true';

    if (isHeadingLink) {
      map.push({
        title: heading.textContent?.trim() ?? '',
        element: heading,
        path: heading.getAttribute('href') ?? '',
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
