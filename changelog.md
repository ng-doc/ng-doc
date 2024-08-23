# Changelog

## Builder

- **Core Rewrite**: The builder's core was rewritten to support multiple markdown files. `chokidar` was replaced with `@parcel/watcher` for faster response times to changes. The new builder is more modular, splitting into smaller builders, allowing only changed parts to be triggered. This improves cache performance by restoring data from the cache when only partial rebuilds are necessary.

## General

- **Syntax Highlighting**: Replaced `highlight.js` with `shiki`, enhancing support for Angular inline template highlighting. This update affects the list of available languages and theme configuration.
- **Mermaid Diagrams**: Added support for Mermaid diagrams in markdown files. Use Mermaid syntax inside code blocks by specifying the `mermaid` language.
- **Removed `keyword` Field**: The `keyword` field was removed from the `NgDocPage` interface. Refer to the Migration Guide for more details.
- **Multiple Markdown Files**: The `mdFile` field now supports an array of paths, allowing multiple markdown files for a single doc page, which will be displayed as tabs.
- **YAML Front Matter**: You can now use YAML front matter syntax to specify `title`, `icon`, `type`, and `keyword` fields in markdown files, customizing tabs.
- **Page Description**: Descriptions for pages can now be specified using JSDoc comments, which will be displayed in the page header.
- **Status Badges**: Status badges for sidebar items can now be specified using the JSDoc `@status` tag. Customize the badge with color and text.
- **Nested Types in Keywords**: Added support for nested types in keywords, improving the readability of API types with complex inline code.
- **Guide Header Templates**: Added a `headerTemplate` property to guides configuration in `ng-doc.config.ts`, allowing customization of guide page headers.
- **Various Fixes**: Implemented various fixes to resolve interface glitches, improving hydration and overall app performance.
- **Orama Search Update**: Orama search engine updated to version `2.0.17`.
- **Signal Input Types**: `NgDocProcessorOptions` now correctly infers the type of signal inputs.
- **Blockquote Success Type**: Added a success type for blockquotes.

## Schematics

- **Auto-generated Keywords**: The `builder:page` schematic now automatically generates a keyword for the page based on the title.

## UI

- **Design Update**: Slightly updated the app's design.
- **Reworked Search**: Search functionality is now fullscreen and consistent across Desktop and Mobile.
- **Navbar Inputs**: `leftContent`, `rightContent`, and `centerContent` inputs were replaced with attribute selectors like `ngDocNavbarLeft` and `ngDocNavbarRight` in `ng-doc-navbar`. The `centerContent` input was removed.
- **Image Viewer**: Added an image viewer feature, making images in markdown files clickable and viewable in fullscreen mode.
- **Sticky Demos**: Demos in playgrounds are now sticky.
- **Themes Update**: The themes feature was changed to fix a glitch with SSR enabled. Now, themes should be defined in CSS/SCSS files and imported directly into `style.css`. Registration is no longer needed.
- **Sidenav and Sidebar**: Sidenav and sidebar APIs were updated to support hydration and SSR.
- **Scrollable Tables**: Tables are now scrollable if too wide, with the first column of API tables being sticky.
- **Heading Anchors**: Clicking on heading anchors now copies the anchor to the clipboard instead of navigating.
- **API References**: The API References page has been reworked.

## API

- **Selectors as Keywords**: Component/Directive/Pipe selectors are now used as keywords by default, automatically converting to API links in inline code or `HTML` code blocks.
- **JSDoc Tag Support**: Added support for various JSDoc tags including `@internal`, `@deprecated`, `@experimental`, `@alpha`, and `@beta`.
- **New `NgDocApi` Class**: Introduced the `NgDocApi` class for displaying API info in guides, with methods like `NgDocApi.api` for generating API tables and `NgDocApi.details` for detailed API information.
- **Function/Method Overloads**: API now displays function and method overloads.
- **New `JSDoc` Class**: Added the `JSDoc` class for displaying JSDoc comments in guides, with methods for retrieving descriptions, tags, and checking for specific tags.
