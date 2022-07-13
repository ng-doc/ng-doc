import '@angular/compiler';

import {CommonModule} from '@angular/common';
import {
	ChangeDetectionStrategy,
	Compiler,
	Component,
	ComponentFactory,
	ComponentRef,
	Injector,
	Input,
	ModuleWithComponentFactories,
	NgModule,
	Type,
	ViewChild,
	ViewContainerRef,
} from '@angular/core';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {NgDocPlaygroundDynamicContent} from '@ng-doc/builder';
import {asArray} from '@ng-doc/ui-kit';

class NgDocDemoComponent {}

class NgDocDemoModule {}

@Component({
	selector: 'ng-doc-playground-demo',
	templateUrl: './playground-demo.component.html',
	styleUrls: ['./playground-demo.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundDemoComponent {
	@Input()
	selector: string = '';

	@Input()
	template: string = '';

	@Input()
	dynamicContent?: NgDocPlaygroundDynamicContent[];

	@ViewChild('demoOutlet', {static: true, read: ViewContainerRef})
	demoOutlet?: ViewContainerRef;

	private demoRef?: ComponentRef<NgDocDemoComponent>;

	constructor(
		private readonly rootPage: NgDocRootPage,
		private readonly injector: Injector,
		private readonly compiler: Compiler,
	) {}

	ngAfterViewInit(): void {
		this.createDemo(this.template);
	}

	createDemo(template: string): void {
		const sharedModules: Array<Type<unknown>> = [CommonModule, ...asArray(this.rootPage.module)];
		const componentType: Type<NgDocDemoComponent> = Component({template})(
			NgDocDemoComponent,
		);
		const componentModuleType: Type<NgDocDemoModule> = NgModule({
			declarations: [componentType],
			imports: sharedModules,
		})(NgDocDemoModule);
		const module: ModuleWithComponentFactories<NgDocDemoComponent> =
			this.compiler.compileModuleAndAllComponentsSync(componentModuleType);

		const factory: ComponentFactory<NgDocDemoComponent> | undefined = module.componentFactories.find(
			(comp: ComponentFactory<NgDocDemoComponent>) => comp.componentType === componentType,
		);

		this.demoRef = factory && this.demoOutlet?.createComponent(factory);

		this.demoRef?.changeDetectorRef.detectChanges();
	}
}
