import {Component, OnInit} from '@angular/core';

@Component({
	selector: 'ng-doc-header',
	templateUrl: './header.component.html',
	styleUrls: ['./header.component.scss'],
})
export class NgDocHeaderComponent implements OnInit {
	constructor() {
		console.log('header76');
	}

	ngOnInit(): void {}
}
