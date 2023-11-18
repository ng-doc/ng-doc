import { Pipe, PipeTransform } from '@angular/core';

export interface NgDocHighlightPosition {
	start: number;
	length: number;
}

@Pipe({
	name: 'ngDocHighlighterPipe',
	standalone: true,
})
export class NgDocHighlighterPipe implements PipeTransform {
	transform(input: string, positions: NgDocHighlightPosition[]): string {
		positions
			.sort((a: NgDocHighlightPosition, b: NgDocHighlightPosition) => b.start - a.start)
			.forEach((position: NgDocHighlightPosition) => {
				const { start, length } = position;
				const end = start + length;

				input = `${input.slice(0, start)}<mark class="ng-doc-mark">${input.slice(
					start,
					end,
				)}</mark>${input.slice(end)}`;
			});

		return input;
	}
}
