[![GitHub Workflow Status][build-shield]][build-url]
[![NPM][npm-shield]][npm-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/ng-doc/ng-doc">
    <img src="https://ng-doc.com/assets/images/ng-doc.svg?raw=true" alt="Logo" height="150px">
  </a>

<h3 align="center">NgDoc</h3>

  <p align="center">
    Create user-friendly documentation for your projects with ease!
    <br />
    <a href="https://ng-doc.com/"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/ng-doc/ng-doc/issues">Report Bug</a>
    ·
    <a href="https://github.com/ng-doc/ng-doc/issues">Request Feature</a>
  </p>
</div>

<!-- ABOUT THE PROJECT -->

## About The Project

This project was originally created to speed up the writing of documentation for your Angular
libraries and applications and make it flexible. We want to make this process as quick and easy as
possible for you so that you can focus on writing code and not on finding solutions for your
documentation.

NgDoc allows you to do the following things:

- Dynamic markdown templates for your guidelines via Nunjucks
- Render demos on the page in one line of code
- Create playgrounds for your Angular Components and Directives
- The documentation for your API is based on comments to your code
- Dynamic links to API, Pages, or foreign websites via `Keywords` feature
- Automatic generation of links to your API in code examples or in mentions of any entity inside
  inline code
- Offline search that collects indexes automatically based on you documentation
- Customizable interface
- And much more!

<!-- GETTING STARTED -->

## Getting Started

### Installation

> **Warning**
> This library was created for Angular 15+ projects, it may not work with previous versions

First of all you need an Angular application which will be used to render the documentation, after
that you can install NgDoc using the command below, it will automatically install all the necessary
packages and configure your application.

```bash
ng add @ng-doc/add
```

<!-- CONTRIBUTING -->

## Contributing

Contributing features or bugs is currently closed, but it will soon reopen once we finish the guide that will provide
detailed instructions on how to do it. This does not apply to documentation edits, which are still highly encouraged! :)

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[npm-shield]: https://img.shields.io/npm/v/@ng-doc/builder.svg?style=for-the-badge
[npm-url]: https://www.npmjs.com/package/@ng-doc/builder
[license-shield]: https://img.shields.io/github/license/ng-doc/ng-doc.svg?style=for-the-badge
[license-url]: https://github.com/ng-doc/ng-doc/blob/main/LICENSE
[build-shield]: https://img.shields.io/github/actions/workflow/status/ng-doc/ng-doc/release.yml?style=for-the-badge&branch=release
[build-url]: https://github.com/ng-doc/ng-doc/actions
