## Builder

- the core of the builder was rewritten to support multiple markdown files,
  now it also should rebuild the changed files faster

## General

- `keyword` field was removed from the `NgDocPage` interface.
- `mdFile` field is now support array of paths, you can specify multiple
  markdown files for a single doc page, they will be displayed as tabs in the doc page.
- you can also specify the `title`, `icon`, `type` and `keyword` fields in the markdown file using
  YAML front matter syntax to customize tabs.
- `title` field is now always displayed in the doc page, you don't need to specify it in the
  markdown file.
- added `description` field to the `NgDocPage` interface, it is used to specify the description of
  the doc page, and will be displayed in the page header.
- Add support for nested types for keyword usages, it means long inline code that use several types
  inside will be displayed correctly. This feature highly improves readability of the API types.
- added `headerTemplate` property to guides configuration, it is used to specify the header template
  for the guide page that can be used to customize header for each guide page.
- Bunch of different fixes that resolve interface glitches and highly improve hydration and
  performance of the app.
- Orama search that's used as a primary search engine was updated to `2.0.17` version.

## UI

- Slightly redesigned the app
- Reworked search, now it's fullscreen and works the same way for the Desktop and Mobile.
- `leftContent`, `rightContent` and `centerContent` inputs were replaced with attribute selectors
  like `ngDocNavbarLeft`, `ngdocNavbarRight` and `ngDocNavbarCenter` in the `ng-doc-navbar`
- Demos in playgrounds are now sticky
- Themes feature was changed to fix glitch that occurs when SSR is enabled, now you should used
  CSS/SCSS files to define your themes and import them directly to your `style.css` file,
  registration is not needed anymore.
- Sidenav and sidebar APIs were changed to support hydration and SSR.
- All tables become scrollable if they are too wide. First column for API tables is sticky.
- Heading anchors are now copied to the clipboard when clicked instead of navigating.
- API References page has been reworked

## API

- Component/Directive/Pipe selectors now are used as keywords by default, they'll be automatically
  converted to API links inside inline code or code blocks with the `HTML` language specified.
- Added support for `@deprecated` JSDoc tag
- Added support for `@internal` JSDoc tag
- added a new `NgDocApi` class that you can use in your guides to display API info for the
  provided declaration path.
- added a new `NgDocApi.api` method that generates API tables for the provided declaration path.
- added a new `NgDocApi.details` method that generates API details with information about generic
  types, decorators, selectors, etc. based on the provided declaration type.
- API now displays function and method overloads
- added a new `JSDoc` class that you can use in your guides to display JSDoc comments for the
  provided declaration path.
- added new `JSDoc.description` method that returns the JSDoc description for the provided
  declaration path.
- added new `JSDoc.tag` method that returns the JSDoc tag description for the provided declaration
  path.
- added new `JSDoc.tags` method that returns the JSDoc tags for the provided declaration path.
- added new `JSDoc.hasTag` method that returns true if the provided declaration path has the
  specified JSDoc tag.

TODO:

- make TOC work on mobile
- rework landing page + add reusable components for creating landings
- image viewer
- docs for theming
- update schematics for page generation based on the new API
- improve cache by using lmdb library
- check order of API properties modificators
- indexes for NgDocOverlayRef are not correct

Inspirations:
https://mui.com/base-ui/react-autocomplete/
https://mintlify.com/docs/quickstart
https://docs.t4stack.com/
https://docs.astro.build/en/concepts/why-astro/
