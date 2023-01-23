import {CATEGORY_PATTERN, NgDocWatcher, PAGE_PATTERN} from '@ng-doc/builder';
import {getMockedFileSystem} from '@ng-doc/builder/testing/get-mocked-file-system';
import {GettingStartedMockedCategoryPath, InstallationMockedPagePath} from '@ng-doc/builder/testing/mocks/variables';
import * as fs from 'fs';
import mock from 'mock-fs';
import {first} from 'rxjs/operators';

describe('NgDocWatcher', () => {
	let watcher: NgDocWatcher;

	beforeEach(() => {
		mock(getMockedFileSystem());

		watcher = new NgDocWatcher([PAGE_PATTERN]);
	});

	afterEach(() => {
		mock.restore();
		watcher.close();
	});

	it('should emit watched file path', async () => {
		expect(await watcher.onAdd(PAGE_PATTERN).pipe(first()).toPromise()).toBe(InstallationMockedPagePath);
	});

	it('should emit path when file was changed', async () => {
		await watcher.onReady().pipe(first()).toPromise();

		fs.writeFileSync(InstallationMockedPagePath, '123');

		expect(await watcher.onChange(PAGE_PATTERN).pipe(first()).toPromise()).toBe(InstallationMockedPagePath);
	});

	it('should emit path when file was unlinked', async () => {
		await watcher.onReady().pipe(first()).toPromise();

		fs.unlinkSync(InstallationMockedPagePath);

		expect(await watcher.onUnlink(PAGE_PATTERN).pipe(first()).toPromise()).toBe(InstallationMockedPagePath);
	});

	it('should start watching for new files', async () => {
		await watcher.onReady().pipe(first()).toPromise();

		watcher.watch(CATEGORY_PATTERN);

		expect(await watcher.onAdd(CATEGORY_PATTERN).pipe(first()).toPromise()).toBe(GettingStartedMockedCategoryPath);
	});
});
