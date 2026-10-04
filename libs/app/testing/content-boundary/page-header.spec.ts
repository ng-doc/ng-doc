import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  createComponent,
  EnvironmentInjector,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgDocContentController } from '@ng-doc/app/classes/content-controller';
import { NgDocPageHeaderComponent } from '@ng-doc/app/components/page-header';
import { ɵcaptureNgDocHydrationSnapshots } from '@ng-doc/app/helpers';
import type { NgDocContentSource } from '@ng-doc/core/interfaces';
import { beforeEach, expect, it, vi } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

@Component({
  template: `<ng-doc-page-header [headerContent]="html()" [headerContentSource]="source()" />`,
  imports: [NgDocPageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class HeaderHostComponent {
  readonly html = signal('<h1>Static title</h1>');
  readonly source = signal<NgDocContentSource | undefined>(undefined);
}

class FakeContentController {
  readonly html = signal('<h1>Loaded title</h1>');
  readonly version = signal(1);
  readonly error = signal<Error | undefined>(undefined);
  readonly settled = signal(false);
  readonly loadedVersion = signal<number | undefined>(undefined);
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly processed = vi.fn();
  readonly processingFailed = vi.fn();
}

// Module level: TestBed may reuse the component definition compiled with the provider override
// across the change-detection modes, and with it the factory's closure.
let controller: FakeContentController;

describeChangeDetection('NgDocPageHeaderComponent', ({ providers }) => {
  beforeEach(() => {
    controller = new FakeContentController();
    TestBed.configureTestingModule({ providers: [providers] });
    TestBed.overrideComponent(NgDocPageHeaderComponent, {
      set: { providers: [{ provide: NgDocContentController, useFactory: () => controller }] },
    });
  });

  it('renders the header HTML while there is no content source', async () => {
    const fixture = TestBed.createComponent(HeaderHostComponent);

    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('header h1')?.textContent).toBe('Static title');
    expect(controller.disconnect).toHaveBeenCalledTimes(1);
    expect(controller.connect).not.toHaveBeenCalled();
  });

  it('connects to a content source, follows a new one and renders its content', async () => {
    const fixture = TestBed.createComponent(HeaderHostComponent);
    const first = {} as NgDocContentSource;
    const second = {} as NgDocContentSource;

    fixture.componentInstance.source.set(first);
    await fixture.whenStable();
    const disconnects = controller.disconnect.mock.calls.length;

    expect(controller.connect).toHaveBeenCalledWith(first);
    expect(fixture.nativeElement.querySelector('header h1')?.textContent).toBe('Loaded title');

    fixture.componentInstance.html.set('<h1>Other static title</h1>');
    await fixture.whenStable();

    expect(controller.connect).toHaveBeenCalledTimes(1);

    fixture.componentInstance.source.set(second);
    await fixture.whenStable();

    expect(controller.connect).toHaveBeenLastCalledWith(second);

    fixture.componentInstance.source.set(undefined);
    await fixture.whenStable();

    expect(controller.disconnect).toHaveBeenCalledTimes(disconnects + 1);
  });

  it('shows the error of the content source as an alert', async () => {
    const fixture = TestBed.createComponent(HeaderHostComponent);

    controller.error.set(new Error('Could not load the header.'));
    fixture.componentInstance.source.set({} as NgDocContentSource);
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('header[role="alert"]')?.textContent).toBe(
      'Could not load the header.',
    );
  });

  it('keeps the server-rendered header until the loaded header is processed', async () => {
    // A server-rendered host, reused by the browser: Angular empties it when it creates the
    // component, as it does for a host that skips hydration.
    const host = document.createElement('ng-doc-page-header');
    host.setAttribute('ngskiphydration', 'true');
    host.setAttribute('data-ng-doc-async-content', '');
    host.innerHTML = '<header><h1>Server title</h1></header>';
    document.body.appendChild(host);
    ɵcaptureNgDocHydrationSnapshots(document);
    controller.html.set('');
    controller.version.set(0);

    const ref = createComponent(NgDocPageHeaderComponent, {
      environmentInjector: TestBed.inject(EnvironmentInjector),
      hostElement: host,
    });
    const application = TestBed.inject(ApplicationRef);
    try {
      ref.setInput('headerContent', '');
      ref.setInput('headerContentSource', {} as NgDocContentSource);
      application.attachView(ref.hostView);
      await application.whenStable();

      // The empty header before the source loads is processed too; the copy stays.
      expect(host.hasAttribute('data-ng-doc-hydration-snapshot')).toBe(true);
      expect(host.querySelector('.ng-doc-hydration-snapshot h1')?.textContent).toBe('Server title');

      controller.html.set('<h1>Loaded title</h1>');
      controller.version.set(1);
      controller.loadedVersion.set(1);
      await application.whenStable();

      expect(host.hasAttribute('data-ng-doc-hydration-snapshot')).toBe(false);
      expect(host.querySelector('.ng-doc-hydration-snapshot')).toBeNull();
      expect(host.querySelector('header h1')?.textContent).toBe('Loaded title');
    } finally {
      ref.destroy();
      host.remove();
    }
  });
});
