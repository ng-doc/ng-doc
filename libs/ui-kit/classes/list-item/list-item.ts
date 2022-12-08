import {Highlightable} from '@angular/cdk/a11y';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface NgDocListItem extends Highlightable {}

export abstract class NgDocListItem implements Highlightable {
	abstract selectByUser(): void;
}
