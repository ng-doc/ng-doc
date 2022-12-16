import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';

@Component({
	selector: 'ng-doc-page',
	templateUrl: './page.component.html',
	styleUrls: ['./page.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPageComponent {
	constructor(readonly rootPage: NgDocRootPage) {
		console.log(this.rootPage.pageContent);
	}
}
