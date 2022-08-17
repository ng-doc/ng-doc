import {ChangeDetectionStrategy, Component, InjectionToken, Injector, Input, OnInit} from '@angular/core';
import {getApiDisplayerToken} from '@ng-doc/app/helpers';
import {NgDocApiDisplayer} from '@ng-doc/app/interfaces';
import {Constructor, NgDocExportedDeclaration} from '@ng-doc/core';
import {NgDocComponentContent} from '@ng-doc/ui-kit';

@Component({
	selector: 'ng-doc-api-displayer',
	templateUrl: './api-displayer.component.html',
	styleUrls: ['./api-displayer.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiDisplayerComponent implements OnInit {
	@Input()
	api?: NgDocExportedDeclaration;

	apiDisplayer?: NgDocComponentContent<NgDocApiDisplayer>;

	constructor(private readonly injector: Injector) {}

	ngOnInit(): void {
		if (this.api) {
			const token: InjectionToken<Constructor<NgDocApiDisplayer>> | undefined = getApiDisplayerToken(
				this.api.kind as any,
			);

			if (!token) {
				throw new Error(
					`Unknown api declaration type ${this.api.kind}, or component displayer was not provided!`,
				);
			}

			const displayer: Constructor<NgDocApiDisplayer> = this.injector.get(token);
			this.apiDisplayer = new NgDocComponentContent<NgDocApiDisplayer>(displayer);
		}
	}
}
