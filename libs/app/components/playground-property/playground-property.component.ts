import {ChangeDetectionStrategy, Component, InjectionToken, Injector, Input, OnChanges} from '@angular/core';
import {getTokenForType} from '@ng-doc/app/helpers';
import {NgDocTypeControl} from '@ng-doc/app/interfaces';
import {NgDocPlaygroundProperty} from '@ng-doc/builder';
import {Constructor, NgDocComponentContent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-playground-property',
	templateUrl: './playground-property.component.html',
	styleUrls: ['./playground-property.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocPlaygroundPropertyComponent implements OnChanges {
	@Input()
	name: string = '';

	@Input()
	property?: NgDocPlaygroundProperty;

	content?: NgDocComponentContent<NgDocTypeControl<unknown>>;

	constructor(private readonly injector: Injector) {}

	ngOnChanges(): void {
		const control: Constructor<NgDocTypeControl<unknown>> | undefined = this.property?.type
			? this.getControlForType(this.property?.type)
			: undefined;

		this.content = control ? new NgDocComponentContent<NgDocTypeControl<unknown>>(control) : undefined;
	}

	private getControlForType<T>(type: string): Constructor<NgDocTypeControl<T>> | undefined {
		const token: InjectionToken<Constructor<NgDocTypeControl<T>>> | undefined = getTokenForType<T>(type);

		return token ? this.injector.get(token) : undefined;
	}
}
