import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DomSanitizer } from '@angular/platform-browser';
import { NgDocMembersComponent } from '@ng-doc/app/components/members';
import { NgDocMembersFilterDirective } from '@ng-doc/app/directives/members-filter';
import { NgDocPageProcessorComponent } from '@ng-doc/app/processors/page-processor';
import { membersProcessor } from '@ng-doc/app/processors/processors';
import { NgDocThemeService } from '@ng-doc/app/services/theme';
import { NG_DOC_PAGE_PROCESSOR } from '@ng-doc/app/tokens';
import { WA_LOCAL_STORAGE } from '@ng-web-apis/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

class MemoryStorage {
  getItem(): string | null {
    return null;
  }

  setItem(): void {
    // The specs do not read the choice back.
  }
}

// The members table as the builder renders it in the symbol view (reduced).
const MEMBERS = `
  <h2 id="ng-doc-members">Members</h2>
  <ng-doc-members>
    <div class="ng-doc-members-bar">
      <div class="ng-doc-members-tabs" role="tablist" aria-label="Filter members">
        <button type="button" role="tab" data-ng-doc-members-tab="all" aria-selected="true">All <span class="ng-doc-members-count">3</span></button>
        <button type="button" role="tab" data-ng-doc-members-tab="properties" aria-selected="false" tabindex="-1">Properties <span class="ng-doc-members-count">2</span></button>
        <button type="button" role="tab" data-ng-doc-members-tab="methods" aria-selected="false" tabindex="-1">Methods <span class="ng-doc-members-count">1</span></button>
      </div>
      <label class="ng-doc-members-filter"><input type="text" data-ng-doc-members-filter></label>
    </div>
    <div class="ng-doc-members-table-wrapper">
      <table class="ng-doc-members-table"><tbody>
        <tr class="ng-doc-members-group" data-group="properties"><td colspan="2"><h3>Properties</h3><span class="ng-doc-members-count">2</span></td></tr>
        <tr class="ng-doc-member" data-group="properties" data-name="size" id="size"><td>size</td><td>The size.</td></tr>
        <tr class="ng-doc-member" data-group="properties" data-name="label" id="label"><td>label</td><td>The label.</td></tr>
        <tr class="ng-doc-members-group" data-group="methods"><td colspan="2"><h3>Methods</h3><span class="ng-doc-members-count">1</span></td></tr>
        <tr class="ng-doc-member" data-group="methods" data-name="open" id="open">
          <td><button type="button" class="ng-doc-member-expand" aria-expanded="false" aria-controls="ng-doc-member-detail-methods-open">open</button></td>
          <td>Opens it.</td>
        </tr>
        <tr class="ng-doc-member-detail" id="ng-doc-member-detail-methods-open" data-group="methods" hidden><td colspan="2">Signature</td></tr>
      </tbody></table>
      <div class="ng-doc-members-empty" hidden>No members match.</div>
    </div>
  </ng-doc-members>
`;

/**
 * Runs change detection until the page has settled.
 * @param fixture - The fixture to settle.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
  }
}

describe('membersProcessor', () => {
  it('projects the generated members table into the members host', () => {
    const host = document.createElement('div');
    host.innerHTML = MEMBERS;
    const element = host.querySelector('ng-doc-members')!;

    expect(membersProcessor.selector).toBe('ng-doc-members');
    expect(membersProcessor.extractOptions(element, host).content?.[0]).toEqual(
      Array.from(element.childNodes),
    );
  });
});

describeChangeDetection('NgDocMembersComponent', ({ providers }: ChangeDetectionCase) => {
  let page: ComponentFixture<NgDocPageProcessorComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        ...providers,
        { provide: WA_LOCAL_STORAGE, useValue: new MemoryStorage() },
        { provide: NgDocThemeService, useValue: { theme: signal(null), set: vi.fn() } },
        { provide: NG_DOC_PAGE_PROCESSOR, useValue: membersProcessor, multi: true },
      ],
    });
    page = TestBed.createComponent(NgDocPageProcessorComponent);
    page.componentRef.setInput(
      'ngDocPageProcessor',
      TestBed.inject(DomSanitizer).bypassSecurityTrustHtml(MEMBERS),
    );
    page.componentRef.setInput('contentVersion', 1);
    await settle(page);
  });

  const element = (): HTMLElement => page.nativeElement;
  const shown = () =>
    [...element().querySelectorAll<HTMLElement>('.ng-doc-member')]
      .filter((row) => !row.hidden)
      .map((row) => row.dataset['name']);

  it('hosts the member filter on the generated table', async () => {
    const host = element().querySelector('ng-doc-members');

    expect(host?.classList).toContain('ng-doc-members');
    expect(host?.querySelector('table.ng-doc-members-table')).not.toBeNull();
    expect(shown()).toEqual(['size', 'label', 'open']);

    element().querySelector<HTMLElement>('[data-ng-doc-members-tab="methods"]')!.click();
    await settle(page);

    expect(shown()).toEqual(['open']);

    element().querySelector<HTMLElement>('.ng-doc-member-expand')!.click();
    await settle(page);

    expect(element().querySelector<HTMLElement>('#ng-doc-member-detail-methods-open')!.hidden).toBe(
      false,
    );
  });

  it('is the component that carries the directive', () => {
    const debug = page.debugElement.query(
      (node) => node.nativeElement?.tagName?.toLowerCase() === 'ng-doc-members',
    );

    expect(debug.componentInstance).toBeInstanceOf(NgDocMembersComponent);
    expect(debug.injector.get(NgDocMembersFilterDirective)).toBeDefined();
  });
});
