import { NgDocCodeType } from '@ng-doc/core';

/**
 *
 * @param lang
 */
export function getCodeTypeFromLang(lang: string): NgDocCodeType | null {
  switch (lang) {
    case 'css':
      return 'CSS';
    case 'less':
      return 'LESS';
    case 'scss':
      return 'SCSS';
    case 'sass':
      return 'SASS';
    case 'html':
      return 'HTML';
    case 'ts':
    case 'typescript':
      return 'TypeScript';
    case 'js':
    case 'javascript':
      return 'JavaScript';
    default:
      return null;
  }
}
