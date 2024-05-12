- the core of the builder was rewritten and optimized.
- `keyword` field was removed from the `NgDocPage` interface.
- `mdFile` field is now support array of paths, you can specify multiple
  markdown files for a single doc page, they will be displayed as tabs in the doc page.
- you can also specify the `title`, `icon`, `type` and `keyword` fields in the markdown file using
  YAML front matter syntax to customize tabs.
- `title` field is now always displayed in the doc page, you don't need to specify it in the
  markdown file.
- added `description` field to the `NgDocPage` interface, it is used to specify the description of
  the doc page, and will be displayed in the page header.
- added `headerTemplate` property to guides configuration, it is used to specify the header template
  for the guide page that can be used to customize header for each guide page.
- Slightly redesigned the app
- Reworked search, now it's fullscreen and works the same way for the Desktop and Mobile.
- Orama search that's used as a primary search engine was updated to `2.0.17` version.
- Bunch of different fixes that resolve interface glitches and highly improve hydration and
  performance of the app.
- `leftContent`, `rightContent` and `centerContent` inputs were replaced with attribute selectors
  like `ngDocNavbarLeft`, `ngdocNavbarRight` and `ngDocNavbarCenter` in the `ng-doc-navbar`
- Demos in playgrounds are now sticky
- Themes feature was changed to fix glitch that occurs when SSR is enabled, now you should used
  CSS/SCSS files to define your themes and import them directly to your `style.css` file,
  registration is not needed anymore.
- Sidenav and sidebar APIs were changed to support hydration and SSR.
- All tables become scrollable if they are too wide. First column for API tables is sticky.

TODO:

- make TOC work on mobile
- rework landing page + add reusable components for creating landings
- add support for substring keywords
- click on anchor should copy the link
- image viewer
- docs for theming
- keywords for selectors

Inspirations:
https://mui.com/base-ui/react-autocomplete/
https://mintlify.com/docs/quickstart
https://docs.t4stack.com/
https://docs.astro.build/en/concepts/why-astro/
