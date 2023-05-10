import {ChangeDetectionStrategy, Component} from '@angular/core';
import highlight from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';

highlight.registerLanguage('bash', bash);

@Component({
	selector: 'ng-doc-landing',
	templateUrl: './landing.component.html',
	styleUrls: ['./landing.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {}
