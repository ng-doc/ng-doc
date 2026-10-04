import { Service, Signal, signal } from '@angular/core';

/** A content source that failed to load or to render. */
export interface NgDocContentFailure {
  /** Id of the content source that failed. */
  readonly contentId: string;
  /** The error it failed with. */
  readonly error: unknown;
}

/** Request-local content failures observed by the SSR readiness boundary. */
@Service()
export class NgDocContentState {
  private readonly failures = new Map<object, NgDocContentFailure>();
  private readonly failureState = signal<NgDocContentFailure | undefined>(undefined);

  /**
   * The failure `currentFailure()` returns, as a signal. It changes with every
   * `report()` and `clear()` call.
   */
  readonly failure: Signal<NgDocContentFailure | undefined> = this.failureState.asReadonly();

  /**
   * Records the failure of one content owner, replacing its previous failure.
   * @param owner - The object that owns the content source.
   * @param failure - The failure.
   */
  report(owner: object, failure: NgDocContentFailure): void {
    this.failures.set(owner, failure);
    this.failureState.set(this.currentFailure());
  }

  /**
   * Forgets the failure of one content owner.
   * @param owner - The object that owns the content source.
   */
  clear(owner: object): void {
    if (!this.failures.delete(owner)) return;
    this.failureState.set(this.currentFailure());
  }

  /** Returns the oldest failure that is still recorded, if any. */
  currentFailure(): NgDocContentFailure | undefined {
    return this.failures.values().next().value;
  }

  /** Throws the error of `currentFailure()`, if there is one. */
  throwIfFailed(): void {
    const failure = this.currentFailure();
    if (failure) {
      throw failure.error;
    }
  }
}
