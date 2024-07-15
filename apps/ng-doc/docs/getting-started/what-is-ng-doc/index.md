NgDoc is a library for creating documentation for your Angular projects, it is injected into the
build process of a regular Angular application and creates documentation that can be displayed in
it. The current documentation is created using the library itself, so it's already an example of
how it works, what it can do and how it looks.

## Motivation

While working on different projects at various companies or creating open-source projects, I often
encountered the need to create documentation for my library to make it easier for other developers
to understand, explore different examples, and use various functions. When it comes to Angular
libraries, the options are limited. Usually, I had to choose between StoryBook and Compodoc, or use
a tool that is not tightly coupled with the codebase and allows writing guides similar to GitBook.

StoryBook and Compodoc didn't satisfy me because the former required writing a lot of boilerplate
code and extensive configuration, while the latter only generated API documentation, which often
wasn't suitable, especially for open-source projects.

In my understanding, good project documentation should consist of guides with usage examples and API
documentation generated based on the code. It would be desirable for them to work together,
referring to each other in the necessary places. However, I also believe that documentation, like
writing tests, is not always a fun task, so I want to make this process as simple and fast
as possible and, in the future, only add new examples and edit existing ones when updating the
codebase.

Hence, the desire to create a tool that would automate as much of the routine work as possible,
while allowing easy and, most importantly, quick documentation writing for projects.

## How does it work?

NgDoc consists of several libraries, first of all, it uses its own Angular Builder, which is
embedded in the build process to render documentation, it generates components, routes for your
pages, after which it launches the standard Angular Builder, and starts watching changes in your
files to rebuild the necessary part of the documentation.

NgDoc does not create an Angular application, it only generates pages and provides other components
to make your documentation look cool! This is actually one of the positives because you can modify
your application however you like, or integrate the documentation into an existing application.

## What's next?

I'm going to improve the library further, adding new features and fixes to it and to start using
the library, see the `*GettingStartedInstallation` article.
