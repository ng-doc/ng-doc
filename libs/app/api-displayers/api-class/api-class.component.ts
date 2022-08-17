import {ChangeDetectionStrategy, Component} from '@angular/core';
import {NgDocApiDisplayer} from '@ng-doc/app/interfaces';
import {NgDocExportedClass} from '@ng-doc/core';

@Component({
	selector: 'ng-doc-api-class',
	templateUrl: './api-class.component.html',
	styleUrls: ['./api-class.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NgDocApiClassComponent implements NgDocApiDisplayer<NgDocExportedClass> {
	declaration?: NgDocExportedClass;
}
