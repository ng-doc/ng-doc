import 'zone.js/dist/zone';
import '@angular/compiler';

import {CommonModule} from '@angular/common';
import {Component} from '@angular/core';
import {bootstrapApplication} from '@angular/platform-browser';

@Component({
	selector: 'ng-doc-app',
	standalone: true,
	imports: [CommonModule],
	template: ` <ng-doc-selector></ng-doc-selector> `,
})
export class AppComponent {}

bootstrapApplication(AppComponent);
