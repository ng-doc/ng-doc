---
keyword: 'SSRPage'
---

NgDoc fully supports server-side rendering (SSR) of your documentation. This
means that you can generate static HTML files for your documentation and host
them on any web server for fast loading and SEO.

## Adding SSR to existing documentation

If you already have an existing documentation project that uses NgDoc,
this article will help you add SSR to it. If you try to run the `ng add @angular/ssr`
command on an existing NgDoc project, you will get an error message that looks like this:

```text
Path "undefined" does not exist.
```

It happens because the `ng add @angular/ssr` command tries to add SSR to
the project based on the builder configuration in the `angular.json` file.
Since NgDoc projects use a custom builder, the command fails.

As a workaround, you can replace NgDoc builder with the default Angular
builder, add SSR, and then restore the NgDoc builder back. Here is the list
of NgDoc builders and their Angular alternatives:

| NgDoc builder                 | Angular builder                             |
| ----------------------------- | ------------------------------------------- |
| `@ng-doc/builder:application` | `@angular-devkit/build-angular:application` |
| `@ng-doc/builder:dev-server`  | `@angular-devkit/build-angular:dev-server`  |
