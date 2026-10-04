/**
 * The NgDoc stylesheets `ng-doc add` puts first in the build's `styles`: the global styles and the
 * dark theme, which the theme toggle's Dark and Auto options switch to.
 */
export const NG_DOC_STYLES: string[] = [
  'node_modules/@ng-doc/app/styles/global.css',
  'node_modules/@ng-doc/app/styles/themes/dark.css',
];
