import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ErrorHandler,
  input,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocBasePlayground, NgDocPlaygroundComponent } from '@ng-doc/app/components/playground';
import { providePlaygroundDemo } from '@ng-doc/app/providers/playground-demo';
import { NgDocPage } from '@ng-doc/core/interfaces';
import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

// jsdom implements no Web Animations; tooltips await `animate().finished`.
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: () => ({ finished: Promise.resolve() }) as unknown as Animation,
  });
});

afterAll(() => {
  delete (Element.prototype as Partial<Element>).animate;
});

/** A target that, like many, can't render without the default of its input. */
@Component({
  selector: 'ng-doc-first-render-cloud',
  template: `{{ joined() }}`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CloudComponent {
  readonly tags = input<string[]>(['a', 'b']);
  readonly joined = computed(() => this.tags().join(' '));
}

/** What the builder generates for a playground of `CloudComponent`. */
@Component({
  selector: 'ng-doc-first-render-playground',
  template: `<ng-doc-first-render-cloud [tags]="properties()['tags']" />`,
  imports: [CloudComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CloudPlayground extends NgDocBasePlayground {
  static override readonly selector: string = 'ng-doc-first-render-cloud';
  readonly target = CloudComponent;
  readonly playground = viewChild(CloudComponent);
  readonly viewContainerRef = viewChild(CloudComponent, { read: ViewContainerRef });
  readonly configData: Record<string, unknown> = {};
}

@Component({
  selector: 'ng-doc-first-render-host',
  template: `<ng-doc-playground
    id="CloudPlayground"
    [selectors]="['ng-doc-first-render-cloud']"
    [properties]="{ tags: { type: 'string[]', inputName: 'tags' } }" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundComponent],
})
class HostComponent {}

describeChangeDetection(
  'The first render of a playground in the page',
  ({ providers }: ChangeDetectionCase) => {
    it("renders the target with its inputs' defaults, never undefined", async () => {
      const errors: unknown[] = [];
      const page: NgDocPage = {
        title: 'Cloud',
        mdFile: '',
        playgrounds: { CloudPlayground: { target: CloudComponent, template: '' } },
      };

      TestBed.configureTestingModule({
        providers: [
          ...providers,
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: NgDocRootPage, useValue: { page } },
          providePlaygroundDemo('CloudPlayground', CloudPlayground),
          {
            provide: ErrorHandler,
            useValue: { handleError: (error: unknown) => errors.push(error) },
          },
        ],
      });
      const fixture = TestBed.createComponent(HostComponent);

      for (let round = 0; round < 4; round++) await fixture.whenStable();

      expect(errors).toEqual([]);
      expect(fixture.nativeElement.querySelector('ng-doc-first-render-cloud')?.textContent).toBe(
        'a b',
      );
    });
  },
);
