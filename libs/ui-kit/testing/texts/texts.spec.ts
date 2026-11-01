import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ChangeDetectionStrategy,
  Component,
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, ComponentFixtureAutoDetect, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgDocBlockquoteComponent } from '@ng-doc/ui-kit/components/blockquote';
import { NgDocComboboxComponent } from '@ng-doc/ui-kit/components/combobox';
import {
  NgDocPaneBackDirective,
  NgDocPaneComponent,
  NgDocPaneFrontDirective,
} from '@ng-doc/ui-kit/components/pane';
import {
  NG_DOC_UI_KIT_DEFAULT_TEXTS,
  NG_DOC_UI_KIT_TEXTS,
  NgDocUiKitTexts,
} from '@ng-doc/ui-kit/texts';
import { describe, expect, it } from 'vitest';

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
 * The change-detection modes a spec can run in: both with zone.js loaded, only `zoneless` without.
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

@Component({
  selector: 'ng-doc-ui-kit-texts-host',
  template: `
    <blockquote ng-doc-blockquote type="note"><p>Body</p></blockquote>
    <blockquote ng-doc-blockquote type="warning"><p>Body</p></blockquote>
    <blockquote ng-doc-blockquote type="alert"><p>Body</p></blockquote>
    <blockquote ng-doc-blockquote type="success"><p>Body</p></blockquote>
    <blockquote ng-doc-blockquote type="default"><p>Body</p></blockquote>
    <ng-doc-pane>
      <div ngDocPaneBack>Back</div>
      <div ngDocPaneFront>Front</div>
    </ng-doc-pane>
    <ng-doc-combobox class="default" [ngModel]="null"></ng-doc-combobox>
    <ng-doc-combobox class="own" placeholder="Own" [ngModel]="null"></ng-doc-combobox>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    NgDocBlockquoteComponent,
    NgDocComboboxComponent,
    NgDocPaneComponent,
    NgDocPaneBackDirective,
    NgDocPaneFrontDirective,
  ],
})
class TextsHostComponent {}

/** The texts the host shows, in document order. */
interface ShownTexts {
  titles: string[];
  resizer: string | null;
  placeholder: string | null;
  ownPlaceholder: string | null;
}

describeChangeDetection('NG_DOC_UI_KIT_TEXTS', ({ providers }: ChangeDetectionCase) => {
  async function render(
    extra: Provider[] = [],
  ): Promise<{ fixture: ComponentFixture<TextsHostComponent>; shown: ShownTexts }> {
    TestBed.configureTestingModule({
      providers: [...providers, provideHttpClient(), provideHttpClientTesting(), ...extra],
    });

    const fixture = TestBed.createComponent(TextsHostComponent);

    await fixture.whenStable();

    const host: HTMLElement = fixture.nativeElement;

    return {
      fixture,
      shown: {
        titles: Array.from(host.querySelectorAll('.ng-doc-blockquote-title')).map(
          (title: Element) => title.textContent ?? '',
        ),
        resizer: host.querySelector('[role="separator"]')?.getAttribute('aria-label') ?? null,
        placeholder: host.querySelector('.default input')?.getAttribute('placeholder') ?? null,
        ownPlaceholder: host.querySelector('.own input')?.getAttribute('placeholder') ?? null,
      },
    };
  }

  it('shows the English defaults, the texts the components showed before', async () => {
    const { shown } = await render();

    expect(shown).toEqual({
      titles: ['Note', 'Warning', 'Alert', 'Success'],
      resizer: 'Resize the panes',
      placeholder: 'Choose the value',
      ownPlaceholder: 'Own',
    });
  });

  it('renders the same markup when the defaults are provided explicitly', async () => {
    const { fixture } = await render();
    const implicit: string = fixture.nativeElement.innerHTML;

    TestBed.resetTestingModule();

    const explicit = await render([
      { provide: NG_DOC_UI_KIT_TEXTS, useValue: NG_DOC_UI_KIT_DEFAULT_TEXTS },
    ]);

    expect(explicit.fixture.nativeElement.innerHTML).toBe(implicit);
  });

  it('shows the provided texts, while an input set by the author still wins', async () => {
    const german: NgDocUiKitTexts = {
      blockquote: { note: 'Hinweis', warning: 'Warnung', alert: 'Achtung', success: 'Erfolg' },
      pane: { resizer: 'Bereiche anpassen' },
      combobox: { placeholder: 'Wert wählen' },
    };
    const { shown } = await render([{ provide: NG_DOC_UI_KIT_TEXTS, useValue: german }]);

    expect(shown).toEqual({
      titles: ['Hinweis', 'Warnung', 'Achtung', 'Erfolg'],
      resizer: 'Bereiche anpassen',
      placeholder: 'Wert wählen',
      ownPlaceholder: 'Own',
    });
  });
});

describe('NG_DOC_UI_KIT_DEFAULT_TEXTS', () => {
  it('is frozen, so no component can change the texts of another', () => {
    expect(Object.isFrozen(NG_DOC_UI_KIT_DEFAULT_TEXTS)).toBe(true);
    for (const group of Object.values(NG_DOC_UI_KIT_DEFAULT_TEXTS)) {
      expect(Object.isFrozen(group)).toBe(true);
    }
  });
});
