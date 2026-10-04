import { ApplicationRef } from '@angular/core';
import { NgDocContentState } from '@ng-doc/app/services/content-state';

export type NgDocBootstrap<
  TArguments extends unknown[],
  TApplication extends ApplicationRef = ApplicationRef,
> = (...arguments_: TArguments) => Promise<TApplication>;

/** Waits for content loading and processing before returning an SSR application. */
export function withNgDocContentReady<
  TArguments extends unknown[],
  TApplication extends ApplicationRef = ApplicationRef,
>(bootstrap: NgDocBootstrap<TArguments, TApplication>): NgDocBootstrap<TArguments, TApplication> {
  return async (...arguments_: TArguments): Promise<TApplication> => {
    let application: TApplication | undefined;
    try {
      application = await bootstrap(...arguments_);
      await application.whenStable();
      application.injector.get(NgDocContentState).throwIfFailed();
      return application;
    } catch (error) {
      try {
        application?.destroy();
      } catch {
        // Preserve the load, processing, stability, or bootstrap failure.
      }
      throw error;
    }
  };
}
