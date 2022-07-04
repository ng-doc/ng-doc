import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {NgDocPlaygroundConfig, NgDocPlaygroundProperties} from '@ng-doc/builder';

@Component({
	selector: 'ng-doc-playground',
	templateUrl: './playground.component.html',
	styleUrls: ['./playground.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundComponent implements OnInit {
	id?: string;
	properties?: NgDocPlaygroundProperties;

	constructor(private rootPage: NgDocRootPage) {}

	ngOnInit(): void {
		console.log(this.rootPage.playground, this.id, this.properties);
	}

	get configuration(): NgDocPlaygroundConfig | undefined {
		return this.id && this.rootPage.playground ? this.rootPage.playground[this.id] : undefined;
	}
}
