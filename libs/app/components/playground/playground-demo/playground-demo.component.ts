import {AsyncPipe} from '@angular/common';
import {
	ChangeDetectionStrategy,
	Component,
	ComponentRef,
	InjectionToken,
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
import {NgDocDemoDisplayerComponent} from '@ng-doc/app/components/demo-displayer';
import {getPlaygroundDemoToken} from '@ng-doc/app/helpers';
import {NgDocFormPartialValue} from '@ng-doc/app/types';
import {
	buildPlaygroundDemoPipeTemplate,
	buildPlaygroundDemoTemplate,
} from '@ng-doc/core/helpers/build-playground-demo-template';
import {formatHtml} from '@ng-doc/core/helpers/format-html';
import {objectKeys} from '@ng-doc/core/helpers/object-keys';
import {NgDocPlaygroundConfig, NgDocPlaygroundProperties, NgDocPlaygroundProperty} from '@ng-doc/core/interfaces';
import {NgDocExtractedValue} from '@ng-doc/core/types';
import {UntilDestroy, untilDestroyed} from '@ngneat/until-destroy';
import {Observable, of, Subject} from 'rxjs';
import {takeUntil} from 'rxjs/operators';

import {NgDocBasePlayground} from '../base-playground';
import {NgDocPlaygroundForm} from '../playground-form';

@Component({
	selector: 'ng-doc-playground-demo',
	templateUrl: './playground-demo.component.html',
	styleUrls: ['./playground-demo.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgDocDemoDisplayerComponent, AsyncPipe],
})
@UntilDestroy()
export class NgDocPlaygroundDemoComponent<T extends NgDocPlaygroundProperties = NgDocPlaygroundProperties>
	implements OnChanges, OnDestroy
{
	@Input()
	id: string = '';

	@Input()
	pipeName: string = '';

	@Input()
	selector: string = '';

	@Input()
	configuration?: NgDocPlaygroundConfig;

	@Input()
	properties?: T;

	@Input()
	recreateDemo: boolean = false;

	@Input()
	form!: FormGroup<NgDocPlaygroundForm>;

	@ViewChild('demoOutlet', {static: true, read: ViewContainerRef})
	demoOutlet?: ViewContainerRef;

	playgroundDemo?: typeof NgDocBasePlayground;

	code: Observable<string> = of('');

	private demoRef?: ComponentRef<NgDocBasePlayground>;
	private readonly unsubscribe$: Subject<void> = new Subject<void>();

	constructor(private readonly injector: Injector) {}

	ngOnChanges({form, id}: SimpleChanges): void {
		if (form && id) {
			this.unsubscribe$.next();

			const demoInjector: InjectionToken<Array<typeof NgDocBasePlayground>> | undefined = getPlaygroundDemoToken(
				this.id,
			);

			if (demoInjector) {
				const demos: Array<typeof NgDocBasePlayground> = this.injector.get(demoInjector, []);
				this.playgroundDemo = demos.find(
					(demo: typeof NgDocBasePlayground) => demo.selector === this.selector || demo.selector === this.pipeName,
				);
			}

			this.updateDemo();

			this.form?.valueChanges
				.pipe(takeUntil(this.unsubscribe$), untilDestroyed(this))
				.subscribe((data: NgDocFormPartialValue<typeof this.form>) => this.updateDemo(data));
		}
	}

	private updateDemo(data?: NgDocFormPartialValue<typeof this.form>): void {
		if (this.recreateDemo || !this.demoRef) {
			this.renderDemo();
		}

		if (data) {
			this.demoRef?.setInput('properties', data.properties ?? {});
			this.demoRef?.setInput('content', data.content ?? {});
		}

		this.updateCodeView();
	}

	private renderDemo(): void {
		if (this.playgroundDemo) {
			this.demoRef?.destroy();

			if (this.playgroundDemo) {
				this.demoRef = this.demoOutlet?.createComponent(this.playgroundDemo as unknown as Type<NgDocBasePlayground>);
			}

			this.demoRef?.changeDetectorRef.detectChanges();
		}
	}

	private updateCodeView(): void {
		const template: string = this.pipeName
			? buildPlaygroundDemoPipeTemplate(
					this.configuration?.template ?? '',
					this.pipeName,
					this.getActiveContent(),
					this.getActiveInputs(),
			  )
			: buildPlaygroundDemoTemplate(
					this.configuration?.template ?? '',
					this.selector,
					this.getActiveContent(),
					this.getActiveInputs(),
			  );

		this.code = formatHtml(template);
	}

	private getActiveContent(): Record<string, string> {
		const formData: Record<string, boolean> = (this.form?.controls.content.value as Record<string, boolean>) ?? {};

		return objectKeys(formData).reduce((result: Record<string, string>, key: string) => {
			result[key] = formData[key] ? this.configuration?.content?.[key].template ?? '' : '';

			return result;
		}, {});
	}

	private getActiveInputs(): Record<string, string> {
		const formData: Record<string, NgDocExtractedValue> =
			(this.form?.controls.properties.value as Record<string, NgDocExtractedValue>) ?? {};

		return objectKeys(formData).reduce((result: Record<string, string>, key: string) => {
			const property: NgDocPlaygroundProperty | undefined = this.properties?.[key];

			if (property) {
				const value: NgDocExtractedValue = formData[key];
				const isString: boolean = typeof value === 'string';
				const inputValue: string = isString ? `'${value}'` : `${JSON.stringify(value)}`;

				if ((property.default ?? '') !== inputValue) {
					result[property.inputName] = inputValue;
				}
			}

			return result;
		}, {});
	}

	ngOnDestroy(): void {
		this.unsubscribe$.next();
		this.unsubscribe$.complete();
	}
}
