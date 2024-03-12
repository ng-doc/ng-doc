import { NgDocApi, NgDocPage } from '@ng-doc/core';

import { EntryMetadata } from '../interfaces';

export interface StructuredDoc {
  item: EntryMetadata;
  children?: StructuredDoc[];
}

type StructuredMap = Map<string, [StructuredMap, EntryMetadata]>;
/**
 *
 * @param pages
 * @param items
 */
export function getStructuredDocs(
  items: Array<EntryMetadata<NgDocPage | NgDocApi>>,
): StructuredDoc[] {
  const structuredMap: StructuredMap = new Map();

  items.forEach((item) => {
    addLevel(structuredMap, createLevels(item));
  });

  return getStructuredDocsFromMap(structuredMap);
}

/**
 *
 * @param structuredMap
 */
function getStructuredDocsFromMap(structuredMap: StructuredMap): StructuredDoc[] {
  const structuredDocs: StructuredDoc[] = [];

  structuredMap.forEach(([map, item]) => {
    const children = getStructuredDocsFromMap(map);

    structuredDocs.push({ item, children });
  });

  return structuredDocs;
}

/**
 *
 * @param structuredMap
 * @param levels
 */
function addLevel(structuredMap: StructuredMap, levels: EntryMetadata[]): void {
  const [level, ...rest] = levels;

  if (level) {
    const route = level.route;
    const [map, item] = structuredMap.get(route) || [new Map(), level];

    structuredMap.set(route!, [map, item]);

    addLevel(map, rest);
  }
}

/**
 *
 * @param item
 */
function createLevels(item: EntryMetadata): EntryMetadata[] {
  const levels: EntryMetadata[] = [];
  let level: EntryMetadata | undefined = item;

  while (level) {
    levels.unshift(level);
    level = level.category;
  }

  return levels;
}
