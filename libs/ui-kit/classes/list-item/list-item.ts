import {Highlightable} from '@angular/cdk/a11y';
import {ElementRef} from '@angular/core';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface NgDocListItem extends Highlightable {}

export abstract class NgDocListItem implements Highlightable {
	abstract elementRef: ElementRef<HTMLElement> | HTMLElement;
	abstract selectByUser(): void;
}
