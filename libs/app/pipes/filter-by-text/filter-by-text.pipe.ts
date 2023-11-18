import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
	name: 'ngDocFilterByText',
	standalone: true,
})
export class NgDocFilterByTextPipe<T> implements PipeTransform {
	transform(
		items: readonly T[],
		searchTerm: string,
		matcher: (item: T, searchTerm: string) => boolean = (item: T, s: string) => String(item) === s,
	): readonly T[] {
		return items?.filter((item: T) => matcher(item, searchTerm)) ?? [];
	}
}
