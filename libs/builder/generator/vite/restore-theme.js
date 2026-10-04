// Restores the reader's theme before the application starts. An empty stored id is the light
// theme: it removes a `data-theme` that index.html sets by default.
const themeId = localStorage.getItem('ng-doc-theme-id');

if (themeId !== null) {
  const documentElement = document.documentElement;

  if (themeId) {
    documentElement.setAttribute('data-theme', themeId);
  } else {
    documentElement.removeAttribute('data-theme');
  }
}
