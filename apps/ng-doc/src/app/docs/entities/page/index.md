# {{ NgDocPage.title }}

The page is the main building block of your guidelines, which you can use to describe some
cool features of your project, show various demos, create playgrounds and do many other things
that are useful to your users.

## Creating a page

All pages should have the file name `ng-doc.page.ts`, this helps to find these pages in your code
and render their content.
In order to create a page you can use special schematic, you can call it even without parameters,
it will ask questions and show hints for required properties. You can find all available options in
the interface `NgDocBuildPageSchema`

```bash
ng g @ng-doc/builder:page
```

This command will create a folder with your page name and generate `ng-doc.page.ts` and `index.md`
files inside, it also can generate some additional files, like Angular module and dependencies file,
if you are going to show some demos on the page.

## Configuration

{% include "../../shared/export-by-default.md" %}

The `ng-doc.page.ts` file should contain your page configuration,
the page configuration must correspond to the `NgDocPage` type, you can read more about the various
properties in the documentation for the type, below is an example of the minimum page configuration.

```typescript
import {NgDocPage} from '@ng-doc/builder';

export const MyAwesomePage: NgDocPage = {
	title: 'MyAwesomePage',
	mdFile: './index.md',
}

export default MyAwesomePage;
```

## Adding a category

You can use categories to structure your documentation (see the `EntitiesCategory` article
for details on how to create one). To add a category to your page, you can use the `category` field,
just import category and put it in the `category` field, just like that:

```typescript
// ng-doc.page.ts
import {NgDocPage} from '@ng-doc/builder';
import MyAwesomeCategory from '../ng-doc.category';

export const MyAwesomePage: NgDocPage = {
	title: 'MyAwesomePage',
	category: MyAwesomeCategory,
	mdFile: './index.md',
}

export default MyAwesomePage;

```

## Creating a content

Once you've created a page, you can start adding content to your `mdFile`, describing cool things
about your application, and so on. NgDoc automatically collects all of your page's dependencies and
rebuilds page if needed.

Your page content fully supports the `markdown` syntax, but it is
extended with the `nunjucks` engine which allows you to reuse one template for multiple pages, or
render content dynamically, see `ContentNunjucks` or `ContentTemplating` for more details.

## See also

- `EntitiesCategory`
- `EntitiesDependencies`
- `ContentGuidelinesTemplating`
- `ContentGuidelinesDemo`
- `ContentGuidelinesPlayground`
