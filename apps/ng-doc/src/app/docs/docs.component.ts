import {ChangeDetectionStrategy, Component} from '@angular/core';
import {preventInitialChildAnimations} from '@ng-doc/ui-kit';

@Component({
	animations: [preventInitialChildAnimations],
	selector: 'ng-doc-docs',
	templateUrl: './docs.component.html',
	styleUrls: ['./docs.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DocsComponent {}
