import {CommonModule} from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	ComponentRef,
	createNgModuleRef,
	Injector,
	Input,
	NgModule,
	NgModuleRef,
	Type,
	ViewChild,
	ViewContainerRef,
} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {NgDocPlaygroundDynamicContent} from '@ng-doc/builder';
import {asArray} from '@ng-doc/ui-kit';

class NgDocPlaygroundDemoWrapperComponent {}

class NgDocPlaygroundDemoWrapperModule {}

@Component({
	selector: 'ng-doc-playground-demo',
	templateUrl: './playground-demo.component.html',
	styleUrls: ['./playground-demo.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class NgDocPlaygroundDemoComponent {
	@Input()
	selector: string = '';

	@Input()
	template: string = '';

	@Input()
	dynamicContent?: NgDocPlaygroundDynamicContent[];

	@ViewChild('demoOutlet', {static: true, read: ViewContainerRef})
	demoOutlet?: ViewContainerRef

	private componentRef?: ComponentRef<NgDocPlaygroundDemoWrapperComponent>;

	constructor(
		private readonly rootPage: NgDocRootPage,
		private readonly injector: Injector,
	) {}

	ngAfterViewInit(): void {
		this.createComponentFromTemplate(this.template);
	}

	private createComponentFromTemplate(template: string): void {
		this.componentRef?.destroy();

		const component = this.createComponent();
		const module = this.createModule(component);

		this.componentRef = this.demoOutlet?.createComponent(component, {ngModuleRef: module});
	}

	createComponent(): Type<NgDocPlaygroundDemoWrapperComponent> {
		const metadata: Component = new Component({
			selector: 'dynamic',
			template: this.template,
		});

		return Component(metadata)(NgDocPlaygroundDemoWrapperComponent);
	}

	createModule(decoratedComponent: Type<any>): NgModuleRef<any> {
		const decoratedNgModule: NgDocPlaygroundDemoWrapperModule = NgModule({
			imports: [CommonModule, ...asArray(this.rootPage.module)],
			declarations: [decoratedComponent],
		})(NgDocPlaygroundDemoWrapperModule);

		// @ts-ignore
		return createNgModuleRef(this.rootPage.module, this.injector);
	}
}
