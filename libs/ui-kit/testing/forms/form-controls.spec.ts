import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
  signal,
  Type,
} from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { disabled, form, FormField } from '@angular/forms/signals';
import { NgDocCheckboxComponent } from '@ng-doc/ui-kit/components/checkbox';
import { NgDocIconRegistry } from '@ng-doc/ui-kit/components/icon';
import { NgDocToggleComponent } from '@ng-doc/ui-kit/components/toggle';
import { NgDocCheckedChangeDirective } from '@ng-doc/ui-kit/directives/checked-change';
import { afterEach, describe, expect, it } from 'vitest';

// The site's API reference documents every exported declaration under libs/ui-kit, tests
// included, so this spec exports nothing and declares its change-detection helper locally (the
// same helper as testing/change-detection/change-detection-modes.spec.ts).

/** How TestBed schedules change detection in a spec. */
type ChangeDetectionMode = 'zone' | 'zoneless';

/** One change-detection mode and the providers that select it. */
interface ChangeDetectionCase {
  mode: ChangeDetectionMode;
  providers: Array<Provider | EnvironmentProviders>;
}

/**
 * The change-detection modes a spec can run in here: both with zone.js loaded (`nx test`), only
 * zoneless without it (`nx run ui-kit:test-zoneless`).
 */
function changeDetectionCases(): ChangeDetectionCase[] {
  const zoneLoaded = typeof (globalThis as { Zone?: unknown }).Zone !== 'undefined';
  const cases: ChangeDetectionCase[] = [
    { mode: 'zoneless', providers: [provideZonelessChangeDetection()] },
  ];

  return zoneLoaded
    ? [
        {
          mode: 'zone',
          providers: [
            provideZoneChangeDetection(),
            { provide: ComponentFixtureAutoDetect, useValue: true },
          ],
        },
        ...cases,
      ]
    : cases;
}

/**
 * Declares a `describe` block per change-detection mode.
 * @param title - Title of the block; the mode is appended.
 * @param body - Declares the specs for one mode.
 */
function describeChangeDetection(
  title: string,
  body: (testCase: ChangeDetectionCase) => void,
): void {
  for (const testCase of changeDetectionCases()) {
    describe(`${title} (${testCase.mode})`, () => body(testCase));
  }
}

/**
 * Waits until the application is stable, after the microtasks in which forms write values.
 * @param fixture - The fixture of the test.
 */
async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
}

// The checkbox shows icons; the specs do not need their markup or the requests for it.
const iconRegistryStub: Provider = {
  provide: NgDocIconRegistry,
  useValue: { get: () => signal(''), retry: () => void 0 },
};

@Component({
  imports: [NgDocToggleComponent, FormsModule],
  template: `<ng-doc-toggle [(ngModel)]="value" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ToggleNgModelHostComponent {
  readonly value = signal<boolean>(false);
}

@Component({
  imports: [NgDocToggleComponent, ReactiveFormsModule],
  template: `<ng-doc-toggle [formControl]="control" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ToggleReactiveHostComponent {
  readonly control = new FormControl<boolean>(false, { nonNullable: true });
}

@Component({
  imports: [NgDocToggleComponent, FormField],
  template: `<ng-doc-toggle [formField]="settingsForm.enabled" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class ToggleFormFieldHostComponent {
  readonly model = signal({ enabled: false, locked: false });
  readonly settingsForm = form(this.model, (path) => {
    disabled(path.enabled, ({ valueOf }) => valueOf(path.locked));
  });
}

@Component({
  imports: [NgDocCheckboxComponent, FormsModule],
  template: `<ng-doc-checkbox [(ngModel)]="value">Label</ng-doc-checkbox>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CheckboxNgModelHostComponent {
  readonly value = signal<boolean>(false);
}

@Component({
  imports: [NgDocCheckboxComponent, ReactiveFormsModule],
  template: `<ng-doc-checkbox [formControl]="control">Label</ng-doc-checkbox>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CheckboxReactiveHostComponent {
  readonly control = new FormControl<boolean>(false, { nonNullable: true });
}

@Component({
  imports: [NgDocCheckboxComponent, FormField],
  template: `<ng-doc-checkbox [formField]="settingsForm.enabled">Label</ng-doc-checkbox>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CheckboxFormFieldHostComponent {
  readonly model = signal({ enabled: false, locked: false });
  readonly settingsForm = form(this.model, (path) => {
    disabled(path.enabled, ({ valueOf }) => valueOf(path.locked));
  });
}

@Component({
  imports: [NgDocCheckedChangeDirective],
  template: `<input type="checkbox" [(ngDocChecked)]="state" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CheckedChangeHostComponent {
  readonly state = signal<boolean | null>(null);
}

describeChangeDetection('ui-kit form controls', ({ providers }: ChangeDetectionCase) => {
  /**
   * Renders a host component and waits for the forms to write their first value.
   * @param component - The host component.
   */
  async function render<T>(component: Type<T>): Promise<ComponentFixture<T>> {
    TestBed.configureTestingModule({ providers: [...providers, iconRegistryStub] });

    const fixture: ComponentFixture<T> = TestBed.createComponent(component);

    await settle(fixture);

    return fixture;
  }

  /**
   * The element of the first match of a selector in the fixture.
   * @param fixture - The fixture.
   * @param selector - The CSS selector.
   */
  function query<E extends Element = HTMLElement>(
    fixture: ComponentFixture<unknown>,
    selector: string,
  ): E {
    const element: E | null = (fixture.nativeElement as HTMLElement).querySelector<E>(selector);

    if (!element) {
      throw new Error(`No element matches ${selector}`);
    }

    return element;
  }

  afterEach(() => TestBed.resetTestingModule());

  describe('ng-doc-toggle', () => {
    it('reflects and updates an ngModel value', async () => {
      const fixture = await render(ToggleNgModelHostComponent);
      const toggle: HTMLElement = query(fixture, 'ng-doc-toggle');

      expect(toggle.getAttribute('aria-checked')).toBe('false');
      expect(toggle.getAttribute('data-checked')).toBe('false');

      fixture.componentInstance.value.set(true);
      await settle(fixture);

      expect(toggle.getAttribute('aria-checked')).toBe('true');
      expect(toggle.getAttribute('data-checked')).toBe('true');

      query(fixture, '.ng-doc-toggle-wrapper').click();
      await settle(fixture);

      expect(fixture.componentInstance.value()).toBe(false);
      expect(toggle.getAttribute('aria-checked')).toBe('false');
    });

    it('moves the circle to the state of the model', async () => {
      const fixture = await render(ToggleNgModelHostComponent);
      const circle: HTMLElement = query(fixture, '.ng-doc-toggle-circle');

      expect(circle.style.transform).toBe('translateX(0)');

      query(fixture, '.ng-doc-toggle-wrapper').click();
      await settle(fixture);

      expect(fixture.componentInstance.value()).toBe(true);
      // jsdom has no layout, so the measured track length is 0 and "checked" is translateX(0px).
      expect(circle.style.transform).toBe('translateX(0px)');

      query(fixture, '.ng-doc-toggle-wrapper').click();
      await settle(fixture);

      expect(fixture.componentInstance.value()).toBe(false);
      expect(circle.style.transform).toBe('translateX(0)');
    });

    it('works with a reactive form control and its disabled state', async () => {
      const fixture = await render(ToggleReactiveHostComponent);
      const { control } = fixture.componentInstance;
      const toggle: HTMLElement = query(fixture, 'ng-doc-toggle');

      control.setValue(true);
      await settle(fixture);

      expect(toggle.getAttribute('aria-checked')).toBe('true');

      query(fixture, '.ng-doc-toggle-wrapper').click();
      await settle(fixture);

      expect(control.value).toBe(false);
      expect(control.dirty).toBe(true);

      control.disable();
      await settle(fixture);

      expect(toggle.getAttribute('data-disabled')).toBe('true');
      expect(toggle.getAttribute('aria-disabled')).toBe('true');

      query(fixture, '.ng-doc-toggle-wrapper').click();
      await settle(fixture);

      expect(control.value).toBe(false);
    });

    it('binds a signal form field with [formField]', async () => {
      const fixture = await render(ToggleFormFieldHostComponent);
      const host: ToggleFormFieldHostComponent = fixture.componentInstance;
      const toggle: HTMLElement = query(fixture, 'ng-doc-toggle');

      expect(toggle.getAttribute('aria-checked')).toBe('false');

      query(fixture, '.ng-doc-toggle-wrapper').click();
      await settle(fixture);

      expect(host.model().enabled).toBe(true);
      expect(host.settingsForm.enabled().dirty()).toBe(true);

      host.model.set({ enabled: false, locked: false });
      await settle(fixture);

      expect(toggle.getAttribute('aria-checked')).toBe('false');

      host.model.set({ enabled: false, locked: true });
      await settle(fixture);

      expect(toggle.getAttribute('data-disabled')).toBe('true');

      query(fixture, '.ng-doc-toggle-wrapper').click();
      await settle(fixture);

      expect(host.model().enabled).toBe(false);
    });
  });

  describe('ng-doc-checkbox', () => {
    it('reflects and updates an ngModel value through the native input', async () => {
      const fixture = await render(CheckboxNgModelHostComponent);
      const input: HTMLInputElement = query<HTMLInputElement>(fixture, 'input[type="checkbox"]');

      expect(input.checked).toBe(false);

      fixture.componentInstance.value.set(true);
      await settle(fixture);

      expect(input.checked).toBe(true);
      expect(query(fixture, 'ng-doc-checkbox').getAttribute('aria-checked')).toBe('true');

      input.click();
      await settle(fixture);

      expect(fixture.componentInstance.value()).toBe(false);
      expect(input.checked).toBe(false);
    });

    it('works with a reactive form control: value, touched and disabled', async () => {
      const fixture = await render(CheckboxReactiveHostComponent);
      const { control } = fixture.componentInstance;
      const input: HTMLInputElement = query<HTMLInputElement>(fixture, 'input[type="checkbox"]');

      input.click();
      await settle(fixture);

      expect(control.value).toBe(true);
      expect(control.touched).toBe(true);

      control.disable();
      await settle(fixture);

      expect(input.disabled).toBe(true);
    });

    it('binds a signal form field with [formField]', async () => {
      const fixture = await render(CheckboxFormFieldHostComponent);
      const host: CheckboxFormFieldHostComponent = fixture.componentInstance;
      const input: HTMLInputElement = query<HTMLInputElement>(fixture, 'input[type="checkbox"]');

      input.click();
      await settle(fixture);

      expect(host.model().enabled).toBe(true);
      expect(host.settingsForm.enabled().touched()).toBe(true);

      host.model.set({ enabled: false, locked: true });
      await settle(fixture);

      expect(input.checked).toBe(false);
      expect(input.disabled).toBe(true);
    });
  });

  describe('ngDocChecked', () => {
    it('shows null as indeterminate and reports the user choice', async () => {
      const fixture = await render(CheckedChangeHostComponent);
      const input: HTMLInputElement = query<HTMLInputElement>(fixture, 'input');

      expect(input.indeterminate).toBe(true);
      expect(input.checked).toBe(false);

      input.click();
      await settle(fixture);

      expect(fixture.componentInstance.state()).toBe(true);
      expect(input.indeterminate).toBe(false);
      expect(input.checked).toBe(true);

      fixture.componentInstance.state.set(false);
      await settle(fixture);

      expect(input.checked).toBe(false);
    });
  });
});
