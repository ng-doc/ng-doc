import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { TileComponent } from './tile.component';

@Component({
  imports: [TileComponent],
  template: `
    <ng-doc-tile route="/docs" heading="Playgrounds" [emoji]="emoji">Try every input.</ng-doc-tile>
  `,
})
class HostComponent {
  emoji = '🧪';
}

/**
 * The text a screen reader announces for an element: its text without `aria-hidden` subtrees.
 * @param element - The element.
 * @returns The text, whitespace collapsed.
 */
function accessibleText(element: Element): string {
  const clone = element.cloneNode(true) as Element;

  clone.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());

  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('TileComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('shows the emoji but keeps it out of the link text', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a.ng-doc-tile');
    const emoji: HTMLElement = link.querySelector('.ng-doc-tile-emoji')!;

    expect(emoji.textContent?.trim()).toBe('🧪');
    expect(emoji.getAttribute('aria-hidden')).toBe('true');
    expect(accessibleText(link)).toBe('Playgrounds Try every input.');
    expect(accessibleText(link)).not.toContain('🧪');
  });

  it('renders no emoji element without an emoji', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.emoji = '';
    fixture.detectChanges();

    const link: HTMLAnchorElement = fixture.nativeElement.querySelector('a.ng-doc-tile');

    expect(link.querySelector('.ng-doc-tile-emoji')).toBeNull();
    expect(link.querySelector('h3')?.textContent?.trim()).toBe('Playgrounds');
  });
});
