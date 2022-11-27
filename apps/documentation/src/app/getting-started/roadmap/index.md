# {{ NgDocPage.title }}

## Processing assets

Assets that are generated for your demos are currently not processed, which means that `NgDoc`
does not create references for the keywords used in them, for example, to classes or interfaces in
your API, we are going to fix this by starting to process assets by creating references to the
generated API

## Building playgrounds with AOT

Playgrounds are currently using the deprecated JIT compiler, which the Angular team is going to
remove in future releases, moreover, using it forces you to turn off AOT to compile the entire
application, not very cool right? We will rewrite this part, leaving the existing API and moving the
assembly of playgrounds to the side of the `@ng-doc/builder`.

## Stackblitz API

We're going to improve the demo by adding the ability for users of your documentation to open the
demo in Stackblitz, which would be cool, wouldn't it?

## Tests

Features are always cool, but sometimes you have to spend time on boring tests to ensure stability,
you should be familiar with this right? First of all we are going to add tests for the heart of
our library `@ng-doc/builder` and later add them to UI elements as well.

## Did we forget something?

If you have a suggestion or a cool idea to improve the library, you can always leave it in our
project repository.
