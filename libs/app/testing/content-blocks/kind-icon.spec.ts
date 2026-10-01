import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  NG_DOC_KIND_LABELS,
  NgDocKindIconComponent,
  ngDocKindLabel,
} from '@ng-doc/app/components/kind-icon';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  ChangeDetectionCase,
  describeChangeDetection,
} from '../change-detection/change-detection-modes';

@Component({
  selector: 'ng-doc-kind-icon-host',
  template: `<ng-doc-kind-icon [kind]="kind()" [type]="type()" [size]="size()"></ng-doc-kind-icon>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocKindIconComponent],
})
class KindIconHostComponent {
  readonly kind = signal<string>('Class');
  readonly type = signal<'declaration' | 'type'>('declaration');
  readonly size = signal<'small' | 'medium'>('small');
}

describe('ngDocKindLabel', () => {
  it('spells type aliases as two words and keeps other kinds as they are', () => {
    expect(ngDocKindLabel('TypeAlias')).toBe('Type alias');
    expect(NG_DOC_KIND_LABELS['TypeAlias']).toBe('Type alias');

    for (const kind of ['Class', 'Interface', 'Enum', 'Variable', 'Function', 'Component']) {
      expect(ngDocKindLabel(kind)).toBe(kind);
    }

    for (const type of ['string', 'number', 'boolean', 'object', 'null', 'undefined']) {
      expect(ngDocKindLabel(type)).toBe(type);
    }
  });
});

describeChangeDetection('NgDocKindIconComponent', ({ providers }: ChangeDetectionCase) => {
  let fixture: ComponentFixture<KindIconHostComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers });
    fixture = TestBed.createComponent(KindIconHostComponent);
    await fixture.whenStable();
  });

  const chip = (): HTMLElement => fixture.nativeElement.querySelector('ng-doc-kind-icon');

  it('shows the whole kind as a word chip', async () => {
    expect(chip().textContent?.trim()).toBe('Class');
    expect(chip().getAttribute('data-ng-doc-kind')).toBe('Class');
    expect(chip().getAttribute('data-ng-doc-type')).toBe('declaration');
    expect(chip().getAttribute('data-ng-doc-size')).toBe('small');

    fixture.componentInstance.kind.set('TypeAlias');
    fixture.componentInstance.size.set('medium');
    await fixture.whenStable();

    expect(chip().textContent?.trim()).toBe('Type alias');
    // The attribute keeps the kind name: the colours are keyed to it.
    expect(chip().getAttribute('data-ng-doc-kind')).toBe('TypeAlias');
    expect(chip().getAttribute('data-ng-doc-size')).toBe('medium');
  });

  it('shows value types', async () => {
    fixture.componentInstance.kind.set('boolean');
    fixture.componentInstance.type.set('type');
    await fixture.whenStable();

    expect(chip().textContent?.trim()).toBe('boolean');
    expect(chip().getAttribute('data-ng-doc-type')).toBe('type');
  });
});
