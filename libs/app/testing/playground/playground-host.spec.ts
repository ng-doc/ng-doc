import {
  ChangeDetectionStrategy,
  Component,
  input,
  viewChild,
  ViewContainerRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  NgDocBasePlayground,
  NgDocPlaygroundHostComponent,
} from '@ng-doc/app/components/playground';
import { ɵplaygroundStateToFragment } from '@ng-doc/app/demo-app';
import { providePlaygroundDemo } from '@ng-doc/app/providers/playground-demo';
import { afterEach, expect, it } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

let created = 0;

@Component({
  selector: 'ng-doc-host-tag',
  template: `<span class="label">{{ label() }}</span
    ><span class="size">{{ size() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TagComponent {
  readonly label = input('default label');
  readonly size = input(1);

  constructor() {
    created++;
  }
}

/** What the builder generates for a playground of `TagComponent`. */
@Component({
  selector: 'ng-doc-playground-host-spec',
  template: `<ng-doc-host-tag [label]="properties()['label']" [size]="properties()['size']" />`,
  imports: [TagComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class TagPlayground extends NgDocBasePlayground {
  static override readonly selector: string = 'ng-doc-host-tag';
  readonly target = TagComponent;
  readonly playground = viewChild(TagComponent);
  readonly viewContainerRef = viewChild(TagComponent, { read: ViewContainerRef });
  readonly configData: Record<string, unknown> = {};
}

const ROUTES: Routes = [
  {
    path: 'demo-preview/docs/tag',
    providers: [providePlaygroundDemo('TagPlayground', TagPlayground)],
    children: [
      {
        path: 'playground/TagPlayground/ng-doc-host-tag',
        component: NgDocPlaygroundHostComponent,
        data: { ngDocPlayground: { id: 'TagPlayground', selector: 'ng-doc-host-tag' } },
      },
      {
        path: 'playground/Missing/ng-doc-host-tag',
        component: NgDocPlaygroundHostComponent,
        data: { ngDocPlayground: { id: 'Missing', selector: 'ng-doc-host-tag' } },
      },
    ],
  },
];

const PAGE = '/demo-preview/docs/tag/playground/TagPlayground/ng-doc-host-tag';

/**
 *
 * @param properties
 * @param recreate
 */
function fragment(properties: Record<string, unknown>, recreate: boolean = false): string {
  const result = ɵplaygroundStateToFragment({
    inputs: ['label', 'size'],
    properties,
    content: [],
    recreate,
  });

  if (!result.ok) throw new Error(result.reason);
  return result.fragment;
}

describeChangeDetection('NgDocPlaygroundHostComponent', ({ providers }: ChangeDetectionCase) => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    created = 0;
  });

  /**
   * Opens a page of the demo application at a URL, as an iframe loads it: the browser has the URL,
   * fragment included, before the application starts.
   * @param url - The page's URL.
   */
  async function open(url: string): Promise<{ harness: RouterTestingHarness; root: HTMLElement }> {
    window.history.replaceState(null, '', url);
    TestBed.configureTestingModule({ providers: [...providers, provideRouter(ROUTES)] });
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    await harness.fixture.whenStable();
    return { harness, root: harness.routeNativeElement as HTMLElement };
  }

  it("renders the target with the fragment's values", async () => {
    const { root } = await open(`${PAGE}#${fragment({ label: 'Save', size: 3 })}`);

    expect(root.querySelector('.label')?.textContent).toBe('Save');
    expect(root.querySelector('.size')?.textContent).toBe('3');
  });

  it('applies a new fragment to the same target, or creates it again when asked', async () => {
    const { harness, root } = await open(`${PAGE}#${fragment({ label: 'One', size: 1 })}`);

    expect(created).toBe(1);
    window.history.replaceState(null, '', `${PAGE}#${fragment({ label: 'Two', size: 2 })}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await harness.fixture.whenStable();

    expect(root.querySelector('.label')?.textContent).toBe('Two');
    expect(created).toBe(1);

    window.history.replaceState(null, '', `${PAGE}#${fragment({ label: 'Three', size: 3 }, true)}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await harness.fixture.whenStable();
    await harness.fixture.whenStable();

    expect(root.querySelector('.label')?.textContent).toBe('Three');
    expect(created).toBe(2);
  });

  it('keeps the target and its values when the fragment is malformed', async () => {
    const { harness, root } = await open(`${PAGE}#${fragment({ label: 'Kept', size: 1 })}`);

    window.history.replaceState(null, '', `${PAGE}#~inputs=label&~unknown=1`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await harness.fixture.whenStable();

    expect(root.querySelector('.label')?.textContent).toBe('Kept');
  });

  it("says so when the page's playground does not exist", async () => {
    const { root } = await open('/demo-preview/docs/tag/playground/Missing/ng-doc-host-tag');

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('does not exist');
    expect(root.querySelector('.label')).toBeNull();
  });
});
