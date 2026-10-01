/** Immutable linked HTML shared by file and virtual documentation transports. */
export interface NgDocContentModule {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: string;
  readonly html: string;
}

/** Runtime loading boundary. Functions and request state never belong in generator caches. */
export interface NgDocContentSource {
  readonly id: string;
  load(signal: AbortSignal): Promise<NgDocContentModule>;
  /** Notify consumers to load the current revision; return an unsubscribe function. */
  subscribe?(invalidate: () => void): () => void;
}
