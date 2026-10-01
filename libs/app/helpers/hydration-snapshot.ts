/**
 * The host attribute with which a component tells that its content loads asynchronously. The
 * server renders it, so only such hosts are copied: a page with inline content costs nothing.
 * @internal
 */
export const ɵNG_DOC_ASYNC_CONTENT_ATTRIBUTE = 'data-ng-doc-async-content';

/** The NgDoc hosts that skip hydration and whose content loads asynchronously. */
const SKIPPED_ASYNC_HOSTS = ['ng-doc-page', 'ng-doc-page-header']
  .map((tag: string) => `${tag}[ngskiphydration][${ɵNG_DOC_ASYNC_CONTENT_ATTRIBUTE}]`)
  .join(', ');
/** The class of the element that holds a server-rendered copy. */
const SNAPSHOT_CLASS = 'ng-doc-hydration-snapshot';
/** The host attribute that hides the host's own content while the copy is shown. */
const SNAPSHOT_ATTRIBUTE = 'data-ng-doc-hydration-snapshot';

const snapshots = new WeakMap<Element, DocumentFragment>();

/**
 * Copies the server-rendered content of the NgDoc hosts that skip hydration and load their
 * content asynchronously.
 *
 * Angular empties such a host when it creates its component in the browser, and the page would
 * stay blank until the content arrives, so the component shows this copy until its own content
 * renders (`ɵrestoreNgDocHydrationSnapshot`). Call it in the browser before the application
 * renders.
 * @param document - The document that holds the server-rendered application.
 * @internal
 */
export function ɵcaptureNgDocHydrationSnapshots(document: Document): void {
  for (const host of Array.from(document.querySelectorAll(SKIPPED_ASYNC_HOSTS))) {
    if (!host.childNodes.length || snapshots.has(host)) continue;

    const copy = document.createDocumentFragment();

    host.childNodes.forEach((node: ChildNode) => copy.appendChild(node.cloneNode(true)));
    snapshots.set(host, copy);
  }
}

/**
 * Shows the server-rendered copy of a host's content, taken by
 * `ɵcaptureNgDocHydrationSnapshots`, in place of the host's own content until the returned
 * function is called. Each copy is shown once; without one, nothing changes. The copy is inert
 * and the host is busy while it is shown.
 * @param host - The host element of the component.
 * @returns A function that removes the copy and shows the host's own content; later calls do
 * nothing.
 * @internal
 */
export function ɵrestoreNgDocHydrationSnapshot(host: Element): () => void {
  const copy = snapshots.get(host);

  if (!copy) return () => undefined;

  snapshots.delete(host);

  let wrapper: HTMLElement | undefined = host.ownerDocument.createElement('div');

  wrapper.className = SNAPSHOT_CLASS;
  // The copied nodes lay out as the host's own children did. Inline, because the wrapper has no
  // encapsulation attribute for a component style to match.
  wrapper.style.display = 'contents';
  // A static copy: its demos, buttons and links do nothing until the real content replaces it.
  wrapper.setAttribute('inert', '');
  wrapper.appendChild(copy);
  host.insertBefore(wrapper, host.firstChild);
  host.setAttribute(SNAPSHOT_ATTRIBUTE, '');
  host.setAttribute('aria-busy', 'true');

  return () => {
    if (!wrapper) return;
    wrapper.remove();
    wrapper = undefined;
    host.removeAttribute(SNAPSHOT_ATTRIBUTE);
    host.removeAttribute('aria-busy');
  };
}
