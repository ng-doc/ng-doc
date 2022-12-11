# {{ NgDocPage.title }}

NgDoc is a library for creating documentation for your Angular projects, it is injected into the
build process of a regular Angular application and creates documentation that can be displayed in
it.

## Motivation

The project was created to facilitate and speed up the process of writing documentation, for
example, the documentation for your API is collected from the code and comments to it, which makes
it relevant even without using the library, and the guidelines use the `markdown` format, which
allows your users to read it even without switching to the website with the documentation, which
makes
it more useful.

The current tools that you can find for creating documentation did not suit me, because either they
gave too much technical information that was not user-friendly, or they forced me to write too much
code to display simple things, so that's why this documentation engine was created.

## How it works?

NgDoc consists of several libraries, first of all, it uses its own Angular Builder, which is
embedded in the build process to render documentation, it generates components, routes for your
pages, after which it launches the standard Angular Builder, and starts watching changes in your
files to rebuild the necessary part of the documentation.

NgDoc does not create an Angular application, it only generates pages and provides other components
to make your documentation look cool! This is actually one of the positives because you can modify
your application however you like, or integrate the documentation into an existing application.

## What next?

We are going to improve the library further, adding new features and fixes to it, you can see
our `*GettingStartedRoadmap`, and in order to start using the library, see the `*GettingStartedInstallation`
article.
