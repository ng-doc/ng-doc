# {{ NgDocPage.title }}

This topic can help you understand better what is NgDoc and how it works.

First, thank you for your interest in NgDoc. It is designed to help you create
documentation for your wonderful projects faster and easier.
The main goal is to write documentation and not code, that's why this library was created.

Now let's go in order, so what is NgDoc?

NgDoc is a customizable library for creating documentation for your project.
Thanks to the fact that you embed it in an existing project, you have a lot of opportunities,
such as changing the style of the application or individual components, adding your own,
and much more! NgDoc consists of 4 libraries:

- `@ng-doc/builder` - The main library that build and render documentation
- `@ng-doc/app` - Application framework, main logical elements of the application
- `@ng-doc/ui-kit` - Library for user interface development
- `@ng-doc/core` - Shared interfaces, helpers etc. between libraries

## @ng-doc/builder

It contains a special Angular builder that runs before building the application,
builds a dependency tree and watches for changes in the code of files such as
`ng-doc.page.ts`, `ng-doc.category.ts`, etc.

Contains two types of builders `browser` and `dev-server` these are exactly the same
builders that Angular provides you to build the application
and run it in development mode. NgDoc uses these to inject into build mode, and then
it will run one of the native angular builders to build your application.

