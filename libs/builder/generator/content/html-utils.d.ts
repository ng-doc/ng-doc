declare module '@ng-doc/utils' {
  export function processHtml(html: string, config: unknown): Promise<unknown>;
  export function postProcessHtml(html: string): Promise<unknown>;
  export function replaceKeywords(html: string, config: unknown): Promise<string>;
  export function removeNotIndexableContent(html: string): Promise<string>;
}
