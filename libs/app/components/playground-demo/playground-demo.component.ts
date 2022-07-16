import '@angular/compiler';

import {CommonModule} from '@angular/common';
import {
	AfterViewInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Compiler,
	Component,
	ComponentFactory,
	ComponentRef,
	Directive,
	Injector,
	Input,
	ModuleWithComponentFactories,
	NgModule,
	OnChanges,
	OnDestroy,
	SimpleChanges,
	Type,
	ViewChild,
	ViewContainerRef,
} from '@angular/core';
import {FormControl, FormGroup} from '@angular/forms';
import {NgDocRootPage} from '@ng-doc/app/classes';
import {extractProperties} from '@ng-doc/app/helpers/extract-properties';
import {NgDocPlaygroundDynamicContent, NgDocPlaygroundProperties} from '@ng-doc/builder';
import {asArray} from '@ng-doc/core';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';

import {NgDocBaseDemoComponent} from './demo/base-demo.component';
import {NgDocBaseDemoModule} from './demo/base-demo.module';

@Component({
	selector: 'ng-doc-playground-demo',
	templateUrl: './playground-demo.component.html',
	styleUrls: ['./playground-demo.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundDemoComponent<T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties>
	implements OnChanges, AfterViewInit, OnDestroy
{
	@Input()
	target?: Type<unknown>;

	@Input()
	selector: string = '';

	@Input()
	template: string = '';

	@Input()
	dynamicContent?: Record<string, NgDocPlaygroundDynamicContent>;

	@Input()
	reinitializeDemo: boolean = false;

	@Input()
	form?: FormGroup<Record<keyof T, FormControl>>;

	@ViewChild('demoOutlet', {static: true, read: ViewContainerRef})
	demoOutlet?: ViewContainerRef;

	private demoRef?: ComponentRef<NgDocBaseDemoComponent>;
	private readonly unsubscribe$: Subject<void> = new Subject<void>();

	constructor(
		private readonly rootPage: NgDocRootPage,
		private readonly injector: Injector,
		private readonly compiler: Compiler,
	) {}

	ngOnChanges({form}: SimpleChanges): void {
		if (form) {
			this.unsubscribe$.next();

			this.form?.valueChanges
				.pipe(takeUntil(this.unsubscribe$))
				.subscribe((properties: Record<string, unknown>) => {
					console.log('form was changed', properties);
					this.updateDemo(properties);
				});
		}
	}

	ngAfterViewInit(): void {
		this.renderDemo(this.template);
	}

	ngOnDestroy(): void {
		this.unsubscribe$.next();
		this.unsubscribe$.complete();
	}

	private updateDemo(properties: Record<string, unknown>): void {
		if (this.reinitializeDemo) {
			this.renderDemo(this.template);
		} else {
			Object.assign(this.demoRef?.instance.demo ?? {}, extractProperties(properties));
			this.demoRef?.instance?.viewContainerRef?.injector.get(ChangeDetectorRef)?.detectChanges();
		}
	}

	private renderDemo(template: string): void {
		if (this.target) {
			const component: Type<NgDocBaseDemoComponent> = this.createComponent(template, this.target);
			const module: Type<NgDocBaseDemoModule> = this.createModule(component);
			const compiledModule: ModuleWithComponentFactories<NgDocBaseDemoComponent> =
				this.compiler.compileModuleAndAllComponentsSync(module);

			const factory: ComponentFactory<NgDocBaseDemoComponent> | undefined =
				compiledModule.componentFactories.find(
					(comp: ComponentFactory<NgDocBaseDemoComponent>) => comp.componentType === component,
				);

			this.demoRef = factory && this.demoOutlet?.createComponent(factory);

			this.demoRef?.changeDetectorRef.markForCheck();

		}
	}

	private createComponent(template: string, instance: Type<unknown>): Type<NgDocBaseDemoComponent> {
		@Directive()
		class NgDocDemoComponent extends NgDocBaseDemoComponent {
			@ViewChild(instance, {static: true})
			demo?: Type<unknown>;

			@ViewChild(instance, {static: true, read: ViewContainerRef})
			viewContainerRef?: ViewContainerRef;
		}

		return Component({template})(NgDocDemoComponent);
	}

	private createModule(component: Type<unknown>): Type<NgDocBaseDemoModule> {
		class NgDocDemoModule extends NgDocBaseDemoModule {}

		const sharedModules: Array<Type<unknown>> = [CommonModule, ...asArray(this.rootPage.module)];

		return NgModule({
			declarations: [component],
			imports: sharedModules,
		})(NgDocDemoModule);
	}
}
