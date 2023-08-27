import { ChangeDetectionStrategy, Component } from '@angular/core';
import {
	NgDocPaneBackDirective,
	NgDocPaneComponent,
	NgDocPaneFrontDirective,
} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-develop-demo',
	standalone: true,
	imports: [NgDocPaneComponent, NgDocPaneFrontDirective, NgDocPaneBackDirective],
	templateUrl: './develop-demo.component.html',
	styleUrls: ['./develop-demo.component.css'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevelopDemoComponent {}
