import { UTILS } from './utils';

/**
 *
 * @param html
 */
export function minifyHtml(html: string): string {
  return UTILS.minify(html);
}
