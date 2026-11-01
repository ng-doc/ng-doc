/**
 * The window event that the NgDoc development client of the Vite host dispatches when a commit
 * changed only generated content modules (and the search index). Its `detail` holds the new
 * `payloads` of the changed content modules and whether the `search` index changed. A page that
 * applies it calls `preventDefault()`; the client reloads the page when nobody does, so a page
 * without the NgDoc runtime still shows the new content.
 * @internal
 */
export const ɵNG_DOC_CONTENT_UPDATE_EVENT = 'ng-doc:content-update';
