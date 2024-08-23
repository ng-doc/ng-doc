import { InjectionToken } from '@angular/core';

export interface NgDocShikiTheme {
  light: string;
  dark: string;
}

export const NG_DOC_SHIKI_THEME = new InjectionToken<NgDocShikiTheme>('NG_DOC_SHIKI_THEME');
