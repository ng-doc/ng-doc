import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { changeDetectionCases, describeChangeDetection } from './change-detection-modes';

@Component({
  selector: 'ng-doc-counter-fixture',
  template: `<button type="button" (click)="increment()">{{ count() }}</button>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class CounterFixtureComponent {
  protected readonly count = signal(0);

  increment(): void {
    this.count.update((value: number) => value + 1);
  }

  later(): void {
    setTimeout(() => this.increment());
  }
}

describe('changeDetectionCases', () => {
  it('runs both modes with zone.js and only zoneless without it', () => {
    const zoneLoaded = typeof (globalThis as { Zone?: unknown }).Zone !== 'undefined';

    expect(changeDetectionCases().map((testCase) => testCase.mode)).toEqual(
      zoneLoaded ? ['zone', 'zoneless'] : ['zoneless'],
    );
  });
});

describeChangeDetection('a signal-driven OnPush component', ({ providers }) => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers });
  });

  it('renders after a DOM event', async () => {
    const fixture = TestBed.createComponent(CounterFixtureComponent);
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');

    await fixture.whenStable();
    button.click();
    await fixture.whenStable();

    expect(button.textContent).toBe('1');
  });

  it('renders after a timer, without a manual detectChanges', async () => {
    const fixture = TestBed.createComponent(CounterFixtureComponent);

    await fixture.whenStable();
    fixture.componentInstance.later();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toBe('1');
  });
});
