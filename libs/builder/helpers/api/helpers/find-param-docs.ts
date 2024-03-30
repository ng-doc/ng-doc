import { JSDocStructure } from 'ts-morph';

/**
 *
 * @param content
 */
function getParamNameAndContent(content: string): { name: string; content: string } {
  const [name, ...rest] = content.split(/\s-?\s*/);

  return { name: name.trim(), content: rest.join(' ').trim() };
}

/**
 *
 * @param paramName
 * @param docs
 */
export function findParamDocs(paramName: string, docs: JSDocStructure[]): string[] {
  return docs.reduce((docs, doc) => {
    const paramTags = doc.tags
      ?.filter((tag) => tag.tagName === 'param')
      .map((tag) => getParamNameAndContent(tag.text ? String(tag.text) : ''));

    const paramTag = paramTags?.find((tag) => tag.name === paramName);

    if (paramTag) {
      docs.push(paramTag.content);
    }

    return docs;
  }, [] as string[]);
}
