import { createThemeIndexTransformer } from '../angular/index-transform';

let transformer: Promise<(html: string) => Promise<string>> | undefined;

export function transformNgDocIndex(html: string): Promise<string> {
  transformer ??= createThemeIndexTransformer(
    new URL('../angular/restore-theme.js', import.meta.url),
  );
  return transformer.then((transform) => transform(html));
}
