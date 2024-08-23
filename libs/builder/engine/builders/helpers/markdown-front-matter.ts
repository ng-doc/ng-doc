import matter from 'gray-matter';

/**
 *
 * @param mdPath
 */
export function markdownFrontMatter<T extends object>(
  mdPath: string,
): { data: T; content: string } {
  const { data, content } = matter.read(mdPath) as unknown as { data: T; content: string };

  return { data, content };
}
