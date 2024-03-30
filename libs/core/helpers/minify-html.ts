import { minify } from 'html-minifier';

/**
 *
 * @param html
 */
export function minifyHtml(html: string): string {
  return minify(html, {
    collapseWhitespace: true,
    collapseBooleanAttributes: true,
    removeComments: true,
    decodeEntities: true,
    html5: true,
    removeAttributeQuotes: true,
    removeEmptyAttributes: true,
    removeOptionalTags: true,
    removeRedundantAttributes: true,
    trimCustomFragments: true,
  });
}
