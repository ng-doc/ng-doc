import { HttpClient, HttpResponse } from '@angular/common/http';
import { inject, Service, Signal, signal, untracked, WritableSignal } from '@angular/core';

/** State of one icon URL. */
interface NgDocIconEntry {
  readonly svg: WritableSignal<string | null>;
  failed: boolean;
}

/**
 * Loads SVG icons and keeps them for the lifetime of the application.
 *
 * Every URL is requested once and shared by all icons that show it, whether or not the
 * application registers HTTP interceptors. A failed request is logged and remembered: reading the
 * icon again does not send a new request, only `retry()` does. A response that is not SVG markup
 * counts as a failure: dev servers answer a missing file with the application's `index.html`,
 * which must not be rendered as an icon.
 */
@Service()
export class NgDocIconRegistry {
  // The application may provide `HttpClient` only in a lazy injector (route providers), which a
  // root service cannot see. Callers can pass their own client; this one is the fallback.
  private readonly rootHttpClient = inject(HttpClient, { optional: true });
  private readonly icons: Map<string, NgDocIconEntry> = new Map();

  /**
   * Returns the SVG markup stored at `url`, loading it on the first call.
   * @param url - URL of the SVG file.
   * @param httpClient - Client for the request; defaults to the root `HttpClient`.
   * @returns A signal with the markup: `null` while it loads, `''` when the request failed.
   */
  get(url: string, httpClient?: HttpClient): Signal<string | null> {
    // Callers read icons from `computed` and templates. The request may answer synchronously
    // (for example from the hydration transfer cache), and writing a signal while a reactive
    // context is active is an error, so the request runs untracked.
    return untracked(() => {
      let entry: NgDocIconEntry | undefined = this.icons.get(url);

      if (!entry) {
        entry = { svg: signal<string | null>(null), failed: false };
        this.icons.set(url, entry);
        this.load(url, entry, httpClient);
      }

      return entry.svg.asReadonly();
    });
  }

  /**
   * Requests `url` again if its last request failed. Does nothing for an icon that has loaded
   * or is loading.
   * @param url - URL of the SVG file.
   * @param httpClient - Client for the request; defaults to the root `HttpClient`.
   */
  retry(url: string, httpClient?: HttpClient): void {
    untracked(() => {
      const entry: NgDocIconEntry | undefined = this.icons.get(url);

      if (entry?.failed) {
        entry.failed = false;
        this.load(url, entry, httpClient);
      }
    });
  }

  private load(url: string, entry: NgDocIconEntry, httpClient?: HttpClient): void {
    const client: HttpClient | null = httpClient ?? this.rootHttpClient;

    if (!client) {
      throw new Error(
        '[NgDocIconRegistry] No HttpClient: provide one with provideHttpClient() or pass it to get().',
      );
    }

    client.get(url, { responseType: 'text', observe: 'response' }).subscribe({
      next: (response: HttpResponse<string>) => {
        const svg: string = response.body ?? '';

        if (isSvg(svg, response.headers.get('content-type'))) {
          entry.svg.set(svg);
        } else {
          this.fail(
            entry,
            new Error(
              `[NgDocIconRegistry] "${url}" is not an SVG file (content type "${response.headers.get('content-type') ?? 'unknown'}").`,
            ),
          );
        }
      },
      error: (error: unknown) => this.fail(entry, error),
    });
  }

  private fail(entry: NgDocIconEntry, error: unknown): void {
    console.error(error);
    // The entry stays: a failure must not start a new request by itself, or an icon that reads
    // it would request a missing file in a loop.
    entry.failed = true;
    entry.svg.set('');
  }
}

/**
 * Tells whether a response holds SVG markup. The content type is only checked when the server
 * sent one: responses replayed from the hydration transfer cache carry no headers.
 * @param body - The response body.
 * @param contentType - The `Content-Type` header, if any.
 */
function isSvg(body: string, contentType: string | null): boolean {
  if (contentType && /html/i.test(contentType)) {
    return false;
  }

  return /<svg[\s>]/i.test(body);
}
