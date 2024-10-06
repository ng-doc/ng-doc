# Contributing Guidelines

Thank you for your interest in contributing to our project! We welcome and appreciate your contributions. To ensure a
smooth collaboration, please follow the guidelines below.

## Table of Contents

- [How to Contribute](#how-to-contribute)
- [Pull Requests](#pull-requests)
- [Bug Reports](#bug-reports)
- [Feature Requests](#feature-requests)
- [Coding Guidelines](#coding-guidelines)
- [Code of Conduct](#code-of-conduct)
- [Useful commands](#useful-commands)
- [How to release](#how-to-release)
- [How to release beta version](#how-to-release-beta-version)

## How to Contribute

1. Fork the repository and create your branch from the `main` branch.
2. Make your changes and test them thoroughly.
3. Ensure your code follows our coding guidelines (see [Coding Guidelines](#coding-guidelines)).
4. Commit your changes and provide a descriptive commit message.
5. Push your changes to your forked repository.
6. Submit a pull request to the `main` branch of our repository.

## Pull Requests

- Ensure that your pull request addresses an existing issue or feature request.
- Provide a clear and detailed description of the changes made in the pull request.
- Include relevant tests for your changes, if applicable.
- Ensure your code follows our coding guidelines (see [Coding Guidelines](#coding-guidelines)).
- Be responsive to feedback and comments during the review process.
- Please do not take any comments or proposed changes to your pull request too personally. It is important to maintain
  code consistency, which ultimately benefits the longevity of the project.

## Bug Reports

- Before submitting a bug report, search for existing issues to avoid duplicates.
- Include a detailed description of the bug, including steps to reproduce it.
- Provide any relevant error messages or screenshots.
- Specify the version of the project where the bug occurred.
- If possible, propose a fix for the bug.

## Feature Requests

- Before submitting a feature request, search for existing requests to avoid duplicates.
- Provide a clear and detailed description of the feature you are proposing.
- Explain why this feature would be valuable to the project.
- Be open to feedback and discussion about your feature request.

## Coding Guidelines

- Follow the coding style and conventions used in the project.
- Maintain consistency with the existing codebase.
- Write clear and meaningful comments where necessary.
- Keep your code clean, readable, and well-organized.
- Ensure your code passes any relevant tests or linting checks.

## Code of Conduct

Please note that we have a [Code of Conduct](CODE_OF_CONDUCT.md) in place to ensure a welcoming and inclusive
environment for everyone. By participating in this project, you agree to abide by its terms.

If you have any questions or need further assistance, feel free to contact us.

## Useful commands

### Install dependencies

```bash
npm i
```

### Build builders

```bash
nx run builder:build
```

### Run demo application

```bash
npm run serve
```

### Run demo application for POC

You can find all files in `apps/ng-doc/poc` and play with them to see how your feature/bugfix works.
It's useful when you want to quickly test something without starting the whole demo application.

```bash
npm run poc
```

### Run all tests

```bash
npm run test
```

### Run linting

```bash
npm run lint
```

## How to release

Release cycle is fully automated. All you need to do is to push all changes to the `main` branch and merge
it to the `release` branch. After that, the release process will start automatically.

Automated release process releases only commits that have the following commit types:

- `feat` - for new features
- `fix` - for bug fixes
- `perf` - for performance improvements
- `revert` - for reverting changes

All other commits will be ignored for the release, but new version of the demo application will be published,
so if you just update documentation with commits with `docs` type, new version of the demo application will be published.

## How to release beta version

First you need to make sure that `beta` branch is up-to-date with the `release` branch.
To do that, merge `release` branch to the `beta` branch. After that, you can push your changes to the `main` branch
and merge it to the `beta` branch. The release process will start automatically
and new beta version will be published.

Happy contributing!
