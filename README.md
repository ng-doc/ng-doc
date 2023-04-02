[![GitHub Workflow Status][build-shield]][build-url]
[![NPM][npm-shield]][npm-url]
[![MIT License][license-shield]][license-url]

<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/skoropadas/ng-doc">
    <img src="https://ng-doc.com/assets/images/ng-doc.svg?" alt="Logo" height="150px">
  </a>

<h3 align="center">NgDoc</h3>

  <p align="center">
    Create documentation faster than ever!
    <br />
    <a href="https://ng-doc.com/"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/skoropadas/ng-doc/issues">Report Bug</a>
    ·
    <a href="https://github.com/skoropadas/ng-doc/issues">Request Feature</a>
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

Contributions are what make the open source community such an amazing place to learn, inspire, and
create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull
request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'feat(features-scope): add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->

[npm-shield]: https://img.shields.io/npm/v/@ng-doc/builder.svg?style=for-the-badge
[npm-url]: https://www.npmjs.com/package/@ng-doc/builder
[license-shield]: https://img.shields.io/github/license/skoropadas/ng-doc.svg?style=for-the-badge
[license-url]: https://github.com/skoropadas/ng-doc/blob/main/LICENSE
[build-shield]: https://img.shields.io/github/actions/workflow/status/skoropadas/ng-doc/release.yml?style=for-the-badge&branch=release
[build-url]: https://github.com/skoropadas/ng-doc/actions
