const themeId = localStorage.getItem('ng-doc-theme-id');

if (themeId) {
  const documentElement = document.documentElement;
  documentElement.setAttribute('data-theme', themeId);
}
