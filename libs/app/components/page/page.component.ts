import {ChangeDetectionStrategy, Component, OnInit} from '@angular/core';

@Component({
	selector: 'ng-doc-page',
	templateUrl: './page.component.html',
	styleUrls: ['./page.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPageComponent implements OnInit {
	constructor() {}

	ngOnInit(): void {}
}
