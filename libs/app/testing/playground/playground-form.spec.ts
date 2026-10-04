import { TestBed } from '@angular/core/testing';
import { NgDocRootPage } from '@ng-doc/app/classes/root-page';
import { NgDocPlaygroundComponent } from '@ng-doc/app/components/playground';
import { NgDocPlaygroundProperties } from '@ng-doc/core/interfaces';
import { beforeEach, expect, it } from 'vitest';

import { describeChangeDetection } from '../change-detection/change-detection-modes';

/*
 * The playground builds its form from the default values of the target's inputs. An array input
 * (`tags = input<string[]>(...)`) has an array default, which must stay the value of its control.
 */

const PROPERTIES: NgDocPlaygroundProperties = {
  tags: { inputName: 'tags', type: 'string[]', description: '' },
  empty: { inputName: 'empty', type: 'number[]', description: '' },
  label: { inputName: 'label', type: 'string', description: '' },
};

describeChangeDetection('NgDocPlaygroundComponent form', ({ providers }) => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        {
          provide: NgDocRootPage,
          useValue: {
            page: {
              playgrounds: {
                Tags: { defaults: { tags: ['one', 'two'], empty: [], label: 'Label' } },
              },
            },
          },
        },
      ],
    });
    // Only the form is under test here, not the inspector and the demos.
    TestBed.overrideComponent(NgDocPlaygroundComponent, { set: { template: '', imports: [] } });
  });

  it('keeps array defaults as the values of their controls', () => {
    const fixture = TestBed.createComponent(NgDocPlaygroundComponent);

    fixture.componentRef.setInput('id', 'Tags');
    fixture.componentRef.setInput('properties', PROPERTIES);
    fixture.detectChanges();

    expect(fixture.componentInstance.formGroup()?.getRawValue().properties).toEqual({
      tags: ['one', 'two'],
      empty: [],
      label: 'Label',
    });
  });
});
