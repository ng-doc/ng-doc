import {
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	ComponentRef,
	Injector,
	Input,
	OnChanges,
	OnDestroy,
	SimpleChanges,
	Type,
	ViewChild,
	ViewContainerRef,
} from '@angular/core';
import {FormGroup} from '@angular/forms';
import {NgDocRootPage} from '@ng-doc/app/classes/root-page';
import {compileTemplate, formatHtml} from '@ng-doc/app/helpers';
import {NgDocPlaygroundFormData} from '@ng-doc/app/interfaces';
import {NgDocPlaygroundDynamicContent, NgDocPlaygroundProperties} from '@ng-doc/core';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';

import {NgDocBaseDemoComponent} from './demo/base-demo.component';

@Component({
	selector: 'ng-doc-playground-demo',
	templateUrl: './playground-demo.component.html',
	styleUrls: ['./playground-demo.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
@UntilDestroy()
export class NgDocPlaygroundDemoComponent<
	P extends NgDocPlaygroundProperties,
	C extends Record<string, NgDocPlaygroundDynamicContent>,
> implements OnChanges, OnDestroy {
	@Input()
	target?: Type<unknown>;

	@Input()
	selector: string = '';

	@Input()
	template: string = '';

	@Input()
	properties?: P;

	@Input()
	dynamicContent?: C;

	@Input()
	data?: Record<string, unknown>;

	@Input()
	reinitializeDemo: boolean = false;

	@Input()
	form?: FormGroup;

	@ViewChild('demoOutlet', {static: true, read: ViewContainerRef})
	demoOutlet?: ViewContainerRef;

	code: string = '';

	private demoRef?: ComponentRef<NgDocBaseDemoComponent>;
	private readonly unsubscribe$: Subject<void> = new Subject<void>();

	constructor(private readonly rootPage: NgDocRootPage, private readonly injector: Injector) {
	}

	ngOnChanges({form}: SimpleChanges): void {
		if (form) {
			this.unsubscribe$.next();

			this.renderDemo(this.form?.value);
			this.updateCodeView();

			this.form?.valueChanges
				.pipe(takeUntil(this.unsubscribe$), untilDestroyed(this))
				.subscribe((data: NgDocPlaygroundFormData<P, C>) => this.updateDemo(data));
		}
	}

	private updateDemo(data: NgDocPlaygroundFormData<P, C>): void {
		if (this.reinitializeDemo) {
			this.renderDemo(data);
		} else {
			Object.assign(this.demoRef?.instance.demo ?? {}, data.properties);
			Object.assign(this.demoRef?.instance.content ?? {}, data.content);
			this.demoRef?.instance?.viewContainerRef?.injector.get(ChangeDetectorRef)?.markForCheck();
		}

		this.updateCodeView();
	}

	private renderDemo(data: NgDocPlaygroundFormData<P, C>): void {
		if (this.target && this.properties) {
			this.demoRef?.destroy();

			const template: string = compileTemplate(
				this.template,
				this.selector,
				this.properties,
				data,
				this.dynamicContent,
				this.reinitializeDemo ? 'dynamic' : 'compile',
			);
			// const compiledModule: ModuleWithComponentFactories<NgDocBaseDemoComponent> =
			// 	this.compiler.compileModuleAndAllComponentsSync(module);
			//
			// const factory: ComponentFactory<NgDocBaseDemoComponent> | undefined =
			// 	compiledModule.componentFactories.find(
			// 		(comp: ComponentFactory<NgDocBaseDemoComponent>) => comp.componentType === component,
			// 	);
			//
			// this.demoRef = factory && this.demoOutlet?.createComponent(factory);
			//
			// this.demoRef?.changeDetectorRef.markForCheck();
		}
	}

	private updateCodeView(): void {
		const template: string =
			this.properties && this.form
				? compileTemplate(
					this.template,
					this.selector,
					this.properties,
					this.form.value,
					this.dynamicContent,
					'preview',
				)
				: '';

		this.code = formatHtml(template);
	}


	ngOnDestroy(): void {
		this.unsubscribe$.next();
		this.unsubscribe$.complete();
	}
}
