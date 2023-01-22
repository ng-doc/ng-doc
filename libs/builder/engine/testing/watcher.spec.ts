import {CATEGORY_PATTERN, NgDocWatcher, PAGE_PATTERN} from '@ng-doc/builder';
import {createMockCategory, mockedCategoryPath} from '@ng-doc/builder/testing/mocks/create-category';
import {createMockPage, mockedPageFSPath, mockedPagePath} from '@ng-doc/builder/testing/mocks/create-page';
import * as fs from 'fs';
import mock from 'mock-fs';
import {first} from 'rxjs/operators';

describe('NgDocWatcher', () => {
	let watcher: NgDocWatcher;
	const pageName: string = 'page';
	const categoryName: string = 'category';

	beforeEach(() => {
		mock({
			...createMockPage(pageName),
			...createMockCategory(categoryName),
		});

		watcher = new NgDocWatcher([PAGE_PATTERN]);
	});

	afterEach(() => {
		mock.restore();
		watcher.close();
	});

	it('should emit watched file path', async () => {
		expect(await watcher.onAdd(PAGE_PATTERN).pipe(first()).toPromise()).toBe(mockedPagePath(pageName));
	});

	it('should emit path when file was changed', async () => {
		await watcher.onReady().pipe(first()).toPromise();

		fs.writeFileSync(mockedPageFSPath(pageName), '123');

		expect(await watcher.onChange(PAGE_PATTERN).pipe(first()).toPromise()).toBe(mockedPagePath(pageName));
	});

	it('should emit path when file was unlinked', async () => {
		await watcher.onReady().pipe(first()).toPromise();

		fs.unlinkSync(mockedPageFSPath(pageName));

		expect(await watcher.onUnlink(PAGE_PATTERN).pipe(first()).toPromise()).toBe(mockedPagePath(pageName));
	});

	it('should add another file to watchers', async () => {
		await watcher.onReady().pipe(first()).toPromise();

		watcher.watch(CATEGORY_PATTERN);

		expect(await watcher.onAdd(CATEGORY_PATTERN).pipe(first()).toPromise()).toBe(mockedCategoryPath(categoryName));
	});
});
