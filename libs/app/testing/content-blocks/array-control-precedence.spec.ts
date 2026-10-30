import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTypeControl } from '@ng-doc/app/providers/type-control';
import {
  type MockInstance,
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';
import {
  ArrayPropertiesHostComponent,
  builtInTypeControls,
  controlsByName,
} from './type-controls-testing';

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

/** A user's control for `string[]`. */
@Component({ selector: 'ng-doc-user-tags-control', template: 'user tags' })
class UserTagsControlComponent {
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}

/** A user's control for some array types of their own. */
@Component({ selector: 'ng-doc-user-items-control', template: 'user items' })
class UserItemsControlComponent {
  writeValue(): void {}
  registerOnChange(): void {}
  registerOnTouched(): void {}
}

// The registry of type controls is global, so every test of this file registers the same
// controls, after the built-in ones, as a page's providers load after NgDoc's.
describeChangeDetection(
  'Type controls registered for array types',
  ({ providers }: ChangeDetectionCase) => {
    let fixture: ComponentFixture<ArrayPropertiesHostComponent>;
    let warn: MockInstance;

    beforeEach(async () => {
      warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      TestBed.configureTestingModule({
        providers: [
          ...providers,
          provideHttpClient(),
          provideHttpClientTesting(),
          ...builtInTypeControls(),
          provideTypeControl('string[]', UserTagsControlComponent),
          provideTypeControl('Item[]', UserItemsControlComponent),
          provideTypeControl('number[] | null | undefined', UserItemsControlComponent),
        ],
      });
      fixture = TestBed.createComponent(ArrayPropertiesHostComponent);
      await fixture.whenStable();
      await fixture.whenStable();
    });

    afterEach(() => warn.mockRestore());

    it('lets a control for string[] replace the built-in list for every spelling', () => {
      const controls = controlsByName(fixture);

      expect([
        controls['tags'],
        controls['readonlyTags'],
        controls['optionalTags'],
        controls['genericTags'],
      ]).toEqual(Array(4).fill('ng-doc-user-tags-control'));
      // The list of numbers stays the built-in one.
      expect(controls['counts']).toBe('ng-doc-number-list-control');
      expect(controls['genericCounts']).toBe('ng-doc-number-list-control');
    });

    it('matches a control for another array type by its exact text, as any other type', () => {
      const controls = controlsByName(fixture);

      expect(controls['items']).toBe('ng-doc-user-items-control');
      expect(controls['optionalItems']).toBe('ng-doc-json-control');
      // An exact registration wins over the list of its item type.
      expect(controls['nullableCounts']).toBe('ng-doc-user-items-control');
    });
  },
);
