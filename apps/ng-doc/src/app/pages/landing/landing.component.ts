import {ChangeDetectionStrategy, Component} from '@angular/core';
import {RouterLink} from '@angular/router';
import {NgDocButtonComponent, NgDocIconComponent, NgDocMediaQueryDirective, NgDocTextComponent} from '@ng-doc/ui-kit';
import highlight from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';

import {BackgroundComponent} from './background/background.component';

highlight.registerLanguage('bash', bash);

@Component({
	selector: 'ng-doc-landing',
	templateUrl: './landing.component.html',
	styleUrls: ['./landing.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [BackgroundComponent, RouterLink, NgDocIconComponent, NgDocTextComponent, NgDocButtonComponent, NgDocMediaQueryDirective],
})
export class LandingComponent {}
