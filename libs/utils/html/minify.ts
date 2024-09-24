import rehypeMinifyWhitespace from 'rehype-minify-whitespace';
import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';

/**
 *
 * @param html
 */
export function minify(html: string): string {
  return unified()
    .use(rehypeParse, { fragment: true })
    .use(rehypeStringify)
    .use(rehypeMinifyWhitespace)
    .processSync(html)
    .toString();
}
