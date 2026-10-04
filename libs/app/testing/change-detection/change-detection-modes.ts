import {
  EnvironmentProviders,
  Provider,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixtureAutoDetect } from '@angular/core/testing';
import { describe } from 'vitest';

/** How TestBed schedules change detection in a spec. */
export type ChangeDetectionMode = 'zone' | 'zoneless';

/** One change-detection mode and the providers that select it. */
export interface ChangeDetectionCase {
  mode: ChangeDetectionMode;
  providers: Array<Provider | EnvironmentProviders>;
}

/**
 * The change-detection modes a spec can run in here. With zone.js loaded (`nx test`) both run;
 * without it (`nx run <lib>:test-zoneless`) only `zoneless` does, because zone scheduling needs
 * zone.js.
 */
export function changeDetectionCases(): ChangeDetectionCase[] {
  const zoneLoaded = typeof (globalThis as { Zone?: unknown }).Zone !== 'undefined';
  const cases: ChangeDetectionCase[] = [
    { mode: 'zoneless', providers: [provideZonelessChangeDetection()] },
  ];

  return zoneLoaded
    ? [
        {
          mode: 'zone',
          // Zoneless fixtures detect changes like an application does; zone fixtures only do so
          // with auto-detection, so both modes exercise the same scheduling path.
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
 * Declares a `describe` block per change-detection mode. Pass `providers` to
 * `TestBed.configureTestingModule`, so the same assertions run with zone.js scheduling and
 * without it.
 * @param title - Title of the block; the mode is appended.
 * @param body - Declares the specs for one mode.
 */
export function describeChangeDetection(
  title: string,
  body: (testCase: ChangeDetectionCase) => void,
): void {
  for (const testCase of changeDetectionCases()) {
    describe(`${title} (${testCase.mode})`, () => body(testCase));
  }
}
