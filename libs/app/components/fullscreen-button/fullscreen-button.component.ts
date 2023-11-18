import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
	NgDocButtonComponent,
	NgDocIconComponent,
	NgDocTextComponent,
	NgDocTextRightDirective,
} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-fullscreen-button',
	standalone: true,
	templateUrl: './fullscreen-button.component.html',
	styleUrls: ['./fullscreen-button.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	imports: [
		RouterLink,
		NgDocTextComponent,
		NgDocIconComponent,
		NgDocTextRightDirective,
		NgDocButtonComponent,
	],
})
export class NgDocFullscreenButtonComponent {
	@Input({ required: true })
	route!: string;
}
