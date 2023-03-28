# {{ NgDocPage.title }}

## ✅ Processing assets

Assets that are generated for your demos are currently not processed, which means that `NgDoc`
does not create references for the keywords used in them, for example, to classes or interfaces in
your API, we are going to fix this by starting to process assets by creating references to the
generated API

## ✅ ~~Playgrounds~~

We have developed another feature called "Playgrounds", but decided not to include it in the release
because it uses an deprecated JIT Compiler, and its current API does not suit us, we will continue
to work on this feature to include it in the next releases.

## Performance

We also want to work on performance to speed up the generation of documentation, we have a few
ideas, but we'll see what comes of it

## Stackblitz API

We're going to improve the demo by adding the ability for users of your documentation to open the
demo in Stackblitz, which would be cool, wouldn't it?

## Build stability and error output

In order to better understand what went wrong, we would like to improve error output as well as
increase build stability to skip parts of the application that cannot be built.

## Tests

Features are always cool, but sometimes you have to spend time on boring tests to ensure stability,
you should be familiar with this right? First of all we are going to add tests for the heart of
our library `@ng-doc/builder` and later add them to UI elements as well.

## Angular inside markdown

We also want to investigate the possibility of adding angular templates directly to your `markdown`
code, this could be a useful feature, but we are not completely sure about it yet.

## Multi-language support

We want to add support for multiple languages in the future so that you can write even more
user-friendly documentation.

## Did we miss anything?

If you have a suggestion or a cool idea to improve the library, you can always leave it in our
project repository.
