import { NgIf } from '@angular/common';
import {
	AfterContentInit,
	ChangeDetectionStrategy,
	ChangeDetectorRef,
	Component,
	Inject,
	Optional,
} from '@angular/core';
import { NgDocInputHost } from '@ng-doc/ui-kit/classes/input-host';
import { NgDocButtonIconComponent } from '@ng-doc/ui-kit/components/button-icon';
import { NgDocIconComponent } from '@ng-doc/ui-kit/components/icon';
import { NgDocFocusableDirective } from '@ng-doc/ui-kit/directives/focusable';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { FL_CONTROL_HOST, FlControl, FlControlHost } from 'flex-controls';

@Component({
	selector: 'ng-doc-clear-control',
	templateUrl: './clear-control.component.html',
	styleUrls: ['./clear-control.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
	standalone: true,
	imports: [NgIf, NgDocButtonIconComponent, NgDocFocusableDirective, NgDocIconComponent],
})
@UntilDestroy()
export class NgDocClearControlComponent<T> extends FlControl<T> implements AfterContentInit {
	constructor(
		protected override changeDetectorRef: ChangeDetectorRef,
		@Inject(FL_CONTROL_HOST) protected override host: FlControlHost<T>,
		@Inject(NgDocInputHost) @Optional() protected inputHost?: NgDocInputHost<T>,
	) {
		super(host);
	}

	ngAfterContentInit(): void {
		if (this.inputHost?.inputControl) {
			this.inputHost.inputControl.valueChange
				.pipe(untilDestroyed(this))
				.subscribe(() => this.changeDetectorRef.detectChanges());
		}
	}

	get isVisible(): boolean {
		return this.inputHost?.inputControl?.hasValue || this.hasValue;
	}

	clear(): void {
		this.inputHost?.inputControl?.writeValueFromHost(null);
		this.updateModel(null);
	}

	// eslint-disable-next-line @typescript-eslint/no-empty-function
	protected override incomingUpdate(): void {}
}
