<div align="center">
  <h1 align="center">
    <a href="https://ng-doc.com/">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="apps/ng-doc/src/assets/images/brand/lockup-dark.svg">
        <img src="apps/ng-doc/src/assets/images/brand/lockup-light.svg" alt="NgDoc" height="80">
      </picture>
    </a>
  </h1>
  <p align="center">
    📚 The documentation engine for Angular projects.
    <br />
    <a href="https://ng-doc.com/"><strong>📖 Documentation</strong></a>
    ·
    <a href="https://github.com/ng-doc/ng-doc/issues/new/choose">🐞 Report a bug</a>
    ·
    <a href="https://github.com/ng-doc/ng-doc/issues/new/choose">💡 Request a feature</a>
  </p>

[![GitHub Workflow Status][build-shield]][build-url]
[![NPM][npm-shield]][npm-url]
[![MIT License][license-shield]][license-url]

</div>

## 👋 About

NgDoc turns Markdown guides and your TypeScript code into a documentation site for your Angular
library or application. Guides, live demos and API reference live together and link to each other,
so you write less boilerplate and keep the docs next to the code they describe.

NgDoc's own site, [ng-doc.com](https://ng-doc.com/), is built with NgDoc. 🙌

## ✨ Features

- 📝 **Pages in Markdown**, with Nunjucks templates, code blocks, callouts, images and Mermaid
  diagrams.
- 🎬 **Live demos** of your components, added to a page in one line.
- 🛝 **Playgrounds** that let readers change a component's or directive's inputs and see the
  result.
- 📘 **API reference** generated from your code and its JSDoc comments.
- 🔗 **Keywords** that link to pages, API entities or external sites, including automatic links in
  code examples and inline code.
- 🔎 **Offline search**, indexed automatically from your content.
- 🎨 **Customizable UI**: themes, layout, icons and page processors.

## 🚀 Quick start

Add NgDoc to an existing Angular project:

```bash
ng add @ng-doc/add
```

In an Nx workspace:

```bash
npm install @ng-doc/add && npx nx g @ng-doc/add:ng-add
```

Then create a page: a folder with an `ng-doc.page.ts` file and the Markdown it points to.

```ts
// ng-doc.page.ts
import { NgDocPage } from '@ng-doc/core';

const GettingStartedPage: NgDocPage = {
  title: 'Getting started',
  mdFile: './index.md',
};

export default GettingStartedPage;
```

Serve your app and the page appears in the sidebar. 🎉 See the
[documentation](https://ng-doc.com/) for configuration, demos, playgrounds and API docs.

## 🤝 Contributing

Contributions are welcome! ❤️ Please read the [contributing guidelines](CONTRIBUTING.md) before
opening a pull request.

## 📄 License

[MIT](LICENSE)

[npm-shield]: https://img.shields.io/npm/v/@ng-doc/builder.svg?style=for-the-badge
[npm-url]: https://www.npmjs.com/package/@ng-doc/builder
[license-shield]: https://img.shields.io/github/license/ng-doc/ng-doc.svg?style=for-the-badge
[license-url]: https://github.com/ng-doc/ng-doc/blob/main/LICENSE
[build-shield]: https://img.shields.io/github/actions/workflow/status/ng-doc/ng-doc/release.yml?style=for-the-badge&branch=release
[build-url]: https://github.com/ng-doc/ng-doc/actions
