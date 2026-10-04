export interface NgDocApiListItem {
  route: string;
  type: string;
  name: string;
  /**
   * The one-line description of the declaration (the new engine generates it when the declaration
   * has a doc comment).
   */
  description?: string;
  /**
   * The declaration header as written, such as `export class NgDocThemeService` (the new engine
   * generates it).
   */
  signature?: string;
}
