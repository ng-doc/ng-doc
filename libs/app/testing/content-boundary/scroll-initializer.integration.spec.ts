import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import {
  ApplicationInitStatus,
  ApplicationRef,
  Component,
  inject,
  InjectionToken,
  NgZone,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  NavigationEnd,
  NavigationStart,
  provideRouter,
  Router,
  RouterOutlet,
  withEnabledBlockingInitialNavigation,
  withInMemoryScrolling,
} from '@angular/router';
import { provideNgDocApp } from '@ng-doc/app/providers/ng-doc-app';
import { NgDocContentScrollIntent } from '@ng-doc/app/services/content-scroll-intent';
import { NgDocHighlighterService } from '@ng-doc/app/services/highlighter';
import { filter, firstValueFrom } from 'rxjs';
import { afterEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

const TRACE = new InjectionToken<string[]>('scroll initializer integration trace');

@Component({ template: '<h2 id="section">Section</h2>' })
class InitialScrollPage {
  constructor() {
    inject(TRACE).push('page-created');
  }
}

@Component({
  selector: 'scroll-initializer-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class InitialScrollRoot {}

describeChangeDetection(
  'NgDoc scroll intent with actual Angular initializers and Router',
  ({ providers }) => {
    afterEach(() => {
      TestBed.resetTestingModule();
      document.querySelectorAll('scroll-initializer-root').forEach((element) => element.remove());
    });

    it.each([false, true])(
      'captures initial navigation before routed component creation (blocking=%s)',
      async (blocking) => {
        const trace: string[] = [];
        const intents: Array<{ anchor: string; navigationId: number; url: string }> = [];
        await TestBed.configureTestingModule({
          imports: [InitialScrollRoot, InitialScrollPage],
          providers: [
            ...providers,
            // Put Router first to check the harder provider ordering.
            provideRouter(
              [{ path: 'guide', component: InitialScrollPage }],
              withInMemoryScrolling({
                anchorScrolling: 'enabled',
                scrollPositionRestoration: 'enabled',
              }),
              ...(blocking ? [withEnabledBlockingInitialNavigation()] : []),
            ),
            provideLocationMocks(),
            provideNgDocApp({ contentAnchorScrolling: true }),
            { provide: TRACE, useValue: trace },
            {
              provide: NgDocContentScrollIntent,
              useFactory: () => {
                trace.push('intent-created');
                const service = new NgDocContentScrollIntent();
                service.subscribe((intent) => {
                  if (intent) intents.push(intent);
                });
                return service;
              },
            },
            // The highlighter is unrelated to navigation/initializer ordering.
            { provide: NgDocHighlighterService, useValue: { initialize: async () => undefined } },
          ],
        }).compileComponents();

        TestBed.inject(Location).go('/guide#section');
        const router = TestBed.inject(Router);
        const subscription = router.events.subscribe((event) => {
          if (event instanceof NavigationStart) trace.push('navigation-start');
        });
        const completed = firstValueFrom(
          router.events.pipe(
            filter((event): event is NavigationEnd => event instanceof NavigationEnd),
          ),
        );
        const initialized = TestBed.inject(ApplicationInitStatus);
        // `runInitializers` is not part of the public ApplicationInitStatus type.
        TestBed.inject(NgZone).run(() =>
          (initialized as unknown as { runInitializers(): void }).runInitializers(),
        );
        await initialized.donePromise;
        const host = document.createElement('scroll-initializer-root');
        document.body.append(host);
        const application = TestBed.inject(ApplicationRef);
        const root = TestBed.inject(NgZone).run(() =>
          application.bootstrap(InitialScrollRoot, host),
        );
        try {
          const end = await completed;
          expect(trace.indexOf('intent-created')).toBeLessThan(trace.indexOf('navigation-start'));
          expect(trace.indexOf('navigation-start')).toBeLessThan(trace.indexOf('page-created'));
          expect(intents).toEqual([
            { anchor: 'section', navigationId: end.id, url: '/guide#section' },
          ]);
          expect(host.querySelector('#section')?.textContent).toBe('Section');
        } finally {
          subscription.unsubscribe();
          root.destroy();
        }
      },
    );
  },
);
