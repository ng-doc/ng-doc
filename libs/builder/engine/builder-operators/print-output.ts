import {Observable, OperatorFunction} from 'rxjs';
import {tap} from 'rxjs/operators';

import {printError, printWarning} from '../../helpers';
import {NgDocEntity} from '../entities/abstractions/entity';
import {NgDocEntityStore} from '../entity-store';

/**
 * Prints all errors and warnings existing in the store
 *
 * @param store - The store to print warnings and errors from
 */
export function printOutput<T>(store: NgDocEntityStore): OperatorFunction<T, T> {
	return (source: Observable<T>) =>
		source.pipe(
			tap(() => {
				const entitiesWithErrors: NgDocEntity[] = store.getAllWithErrorsOrWarnings().sort(sortEntities);

				if (entitiesWithErrors.length > 0) {
					printError(`NgDoc: ${entitiesWithErrors.length} entities with problems:`);

					entitiesWithErrors.forEach((entity: NgDocEntity) => {
						const printIdFunc = entity.errors.length ? printError : printWarning;

						printIdFunc(`  ${entity.id}:`);

						entity.warnings.forEach((error: Error, i: number) => {
							const isLast: boolean = i === entity.warnings.length - 1 && !entity.errors.length;

							printWarning(`    ${error.message}${isLast ? '\n' : ''}`);
						});

						entity.errors.forEach((error: Error, i: number) => {
							const isLast: boolean = i === entity.errors.length - 1;

							printError(`    ${error}${isLast ? '\n' : ''}`);
						});
					});
				}
			}),
		);
}

/**
 * Sorts entities by errors and warnings
 *
 * @param a - The first entity to compare
 * @param b - The second entity to compare
 */
function sortEntities(a: NgDocEntity, b: NgDocEntity): number {
	if (a.errors.length && !b.errors.length) {
		return -1;
	}

	if (!a.errors.length && b.errors.length) {
		return 1;
	}

	if (a.warnings.length && !b.warnings.length) {
		return -1;
	}

	if (!a.warnings.length && b.warnings.length) {
		return 1;
	}

	return 0;
}
