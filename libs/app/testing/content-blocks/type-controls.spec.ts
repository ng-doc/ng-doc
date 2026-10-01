import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  Input,
  input,
  OnChanges,
  signal,
  SimpleChanges,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, FormsModule } from '@angular/forms';
import { NgDocPlaygroundPropertyComponent } from '@ng-doc/app/components/playground';
import { NgDocProvidedTypeControl, NgDocTypeControl } from '@ng-doc/app/interfaces';
import { NgDocTypeAliasControlComponent } from '@ng-doc/app/type-controls';
import { NgDocPlaygroundProperty } from '@ng-doc/core/interfaces';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';

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

/** A user control written the classic way: plain fields and a hand-written accessor. */
@Component({
  selector: 'ng-doc-plain-control',
  template: `<span class="plain">{{ name }}|{{ default }}|{{ value }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class PlainControlComponent implements NgDocTypeControl<string> {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  name?: string;
  default?: string;
  value: string | null = null;
  changed: (value: string) => void = () => undefined;

  writeValue(value: string | null): void {
    this.value = value;
    this.changeDetectorRef.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.changed = fn;
  }

  registerOnTouched(): void {
    // Not needed here.
  }
}

/** A user control with signal inputs. */
@Component({
  selector: 'ng-doc-signal-control',
  template: `<span class="signal">{{ name() }}|{{ default() }}|{{ value() }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class SignalControlComponent implements NgDocTypeControl<string> {
  readonly name = input<string>('');
  readonly default = input<string | undefined>(undefined);
  readonly value = signal<string | null>(null);
  changed: (value: string) => void = () => undefined;

  writeValue(value: string | null): void {
    this.value.set(value);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.changed = fn;
  }

  registerOnTouched(): void {
    // Not needed here.
  }
}

/** A user control with decorator inputs: the playground sets them through `setInput()`. */
@Component({
  selector: 'ng-doc-decorator-control',
  template: `<span class="decorator">{{ name }}|{{ default }}|{{ value }}</span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class DecoratorControlComponent implements NgDocTypeControl<string>, OnChanges {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  @Input() name?: string;
  @Input() default?: string;
  value: string | null = null;
  changes: string[] = [];
  changed: (value: string) => void = () => undefined;

  ngOnChanges(changes: SimpleChanges): void {
    this.changes.push(...Object.keys(changes));
  }

  writeValue(value: string | null): void {
    this.value = value;
    this.changeDetectorRef.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.changed = fn;
  }

  registerOnTouched(): void {
    // Not needed here.
  }
}

const PROPERTY: NgDocPlaygroundProperty = { type: 'string', inputName: 'label' };

@Component({
  selector: 'ng-doc-property-host',
  template: `
    <ng-doc-playground-property
      name="label"
      [property]="property"
      [typeControl]="typeControl()"
      [control]="control"
      defaultValue="Hello"></ng-doc-playground-property>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocPlaygroundPropertyComponent],
})
class PropertyHostComponent {
  readonly property: NgDocPlaygroundProperty = PROPERTY;
  readonly typeControl = signal<NgDocProvidedTypeControl>({ control: PlainControlComponent });
  readonly control = new FormControl<string | null>('Initial');
}

@Component({
  selector: 'ng-doc-type-alias-host',
  template: `<ng-doc-type-alias-control
    [options]="options"
    [default]="'medium'"
    [isManual]="true"
    [ngModel]="value"></ng-doc-type-alias-control>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgDocTypeAliasControlComponent, FormsModule],
})
class TypeAliasHostComponent {
  readonly options: string[] = ['small', 'medium'];
  readonly value: string = 'medium';
}

describeChangeDetection('Type controls in the playground', ({ providers }: ChangeDetectionCase) => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [...providers, provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it.each([
    ['a control with plain fields', PlainControlComponent, '.plain'],
    ['a control with signal inputs', SignalControlComponent, '.signal'],
    ['a control with decorator inputs', DecoratorControlComponent, '.decorator'],
  ] as const)('sets up %s and keeps it in sync with the form', async (_name, control, selector) => {
    const fixture: ComponentFixture<PropertyHostComponent> =
      TestBed.createComponent(PropertyHostComponent);

    fixture.componentInstance.typeControl.set({ control });
    await fixture.whenStable();

    const text = (): string | undefined =>
      fixture.nativeElement.querySelector(selector)?.textContent;

    expect(text()).toBe('label|Hello|Initial');
    expect(
      fixture.nativeElement.querySelector('.ng-doc-playground-property-name')?.textContent?.trim(),
    ).toBe('label');
    expect(
      fixture.nativeElement.querySelector('ng-doc-kind-icon')?.getAttribute('data-ng-doc-kind'),
    ).toBe('string');

    fixture.componentInstance.control.setValue('From the form');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(text()).toBe('label|Hello|From the form');

    const instance = fixture.debugElement.query(
      (element) => element.componentInstance instanceof control,
    ).componentInstance as { changed: (value: string) => void };

    instance.changed('From the control');

    expect(fixture.componentInstance.control.value).toBe('From the control');
  });

  it('reports the fields it sets as inputs through ngOnChanges', async () => {
    const fixture: ComponentFixture<PropertyHostComponent> =
      TestBed.createComponent(PropertyHostComponent);

    fixture.componentInstance.typeControl.set({ control: DecoratorControlComponent });
    await fixture.whenStable();

    const instance = fixture.debugElement.query(
      (element) => element.componentInstance instanceof DecoratorControlComponent,
    ).componentInstance as DecoratorControlComponent;

    // setInput() marks the inputs as changed: ngOnChanges sees them on the first check.
    expect([...new Set(instance.changes)].sort()).toEqual(['default', 'name']);
  });

  it('shows the value of a type alias and whether it is the default', async () => {
    const fixture: ComponentFixture<TypeAliasHostComponent> =
      TestBed.createComponent(TypeAliasHostComponent);

    // ngModel writes its value in a microtask, and the combobox forwards it in another.
    for (let round = 0; round < 3; round++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }

    const value: HTMLElement = fixture.nativeElement.querySelector('.ng-doc-type-alias-value');

    // The value, then the default marker; the type chip is under the input's name.
    expect(value.textContent?.replace(/\s+/g, '')).toBe('mediumdefault');
    expect(value.querySelector('ng-doc-kind-icon')).toBeNull();
  });
});
