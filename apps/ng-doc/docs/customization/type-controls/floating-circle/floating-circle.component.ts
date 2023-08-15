import {ChangeDetectionStrategy, Component, Input} from '@angular/core';

export interface FloatingCirclePosition {
	top?: string | null;
	left?: string | null;
}

@Component({
	selector: 'ng-doc-floating-circle',
	standalone: true,
	templateUrl: './floating-circle.component.html',
	styleUrls: ['./floating-circle.component.scss'],
	changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FloatingCircleComponent {
	@Input()
	position: FloatingCirclePosition = {top: '10px', left: '10px'};
}
