import { stringifyEntities as stringify } from 'stringify-entities';

/**
 *
 * @param content
 */
export function stringifyEntities(content: string): string {
  return stringify(content);
}
