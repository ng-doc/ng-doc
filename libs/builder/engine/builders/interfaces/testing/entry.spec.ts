import { isApiEntry, isCategoryEntry, isPageEntry } from '../entry';

describe('entry type guards', () => {
  describe('isPageEntry', () => {
    it('should match a standard path', () => {
      expect(
        isPageEntry({} as any, '/home/user/projects/app/docs/installation/ng-doc.page.ts'),
      ).toBe(true);
    });

    it('should match a path containing a dot-directory', () => {
      expect(
        isPageEntry(
          {} as any,
          '/home/user/projects/app/.worktrees/my-branch/docs/installation/ng-doc.page.ts',
        ),
      ).toBe(true);
    });

    it('should not match a non-page file', () => {
      expect(
        isPageEntry({} as any, '/home/user/projects/app/docs/installation/ng-doc.category.ts'),
      ).toBe(false);
    });
  });

  describe('isCategoryEntry', () => {
    it('should match a standard path', () => {
      expect(
        isCategoryEntry({} as any, '/home/user/projects/app/docs/installation/ng-doc.category.ts'),
      ).toBe(true);
    });

    it('should match a path containing a dot-directory', () => {
      expect(
        isCategoryEntry(
          {} as any,
          '/home/user/projects/app/.worktrees/my-branch/docs/installation/ng-doc.category.ts',
        ),
      ).toBe(true);
    });

    it('should not match a non-category file', () => {
      expect(
        isCategoryEntry({} as any, '/home/user/projects/app/docs/installation/ng-doc.page.ts'),
      ).toBe(false);
    });
  });

  describe('isApiEntry', () => {
    it('should match a standard path', () => {
      expect(isApiEntry({} as any, '/home/user/projects/app/docs/installation/ng-doc.api.ts')).toBe(
        true,
      );
    });

    it('should match a path containing a dot-directory', () => {
      expect(
        isApiEntry(
          {} as any,
          '/home/user/projects/app/.worktrees/my-branch/docs/installation/ng-doc.api.ts',
        ),
      ).toBe(true);
    });

    it('should not match a non-api file', () => {
      expect(
        isApiEntry({} as any, '/home/user/projects/app/docs/installation/ng-doc.page.ts'),
      ).toBe(false);
    });
  });
});
