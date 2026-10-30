import { describe, expect, it } from 'vitest';

import { ɵplaygroundTargetSlugs } from './playground-target-slugs';

describe('ɵplaygroundTargetSlugs', () => {
  it('turns selectors and pipe names into lower-case URL segments', () => {
    expect(
      ɵplaygroundTargetSlugs([
        'button[ngDocButton]',
        'ng-doc-tag',
        'a[ngDocButton], button',
        'uppercase',
      ]),
    ).toEqual(['button-ngdocbutton', 'ng-doc-tag', 'a-ngdocbutton-button', 'uppercase']);
  });

  it('numbers the targets whose segments collide, in the order given', () => {
    expect(ɵplaygroundTargetSlugs(['[ngDocTag]', 'ng-doc-tag', '.ng-doc-tag', 'other'])).toEqual([
      'ngdoctag',
      'ng-doc-tag',
      'ng-doc-tag-2',
      'other',
    ]);
  });

  it('names a target without letters or digits "target"', () => {
    expect(ɵplaygroundTargetSlugs(['[]', '*'])).toEqual(['target', 'target-2']);
  });
});
