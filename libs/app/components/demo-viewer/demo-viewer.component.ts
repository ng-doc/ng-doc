import {ChangeDetectionStrategy, Component, OnInit, Type, ViewChild, ViewContainerRef} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes';

@Component({
	selector: 'ng-doc-demo-viewer',
	templateUrl: './demo-viewer.component.html',
	styleUrls: ['./demo-viewer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocDemoViewerComponent implements OnInit {
	@ViewChild('demoOutlet', {static: true, read: ViewContainerRef})
	private demoOutlet?: ViewContainerRef;

	componentName?: string;

	constructor(private readonly rootPage: NgDocRootPage) {}

	ngOnInit(): void {
		if (this.demoOutlet && this.componentName) {
			const component: Type<unknown> | undefined = this.rootPage.demo && this.rootPage.demo[this.componentName];

			if (component) {
				this.demoOutlet.createComponent(component);
			}
		}
	}
}
