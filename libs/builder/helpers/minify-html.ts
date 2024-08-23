import { minify } from 'html-minifier';

/**
 *
 * @param html
 */
export function minifyHtml(html: string): string {
  const minifyHTML = minify;

  return minifyHTML(html, {
    collapseWhitespace: true,
    removeComments: true,
    decodeEntities: true,
    html5: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    trimCustomFragments: true,
    preserveLineBreaks: true,
  });
}
