# {{ NgDocPage.title }}

Pages and Categories that you create as files in your project are used in the Builder side
and in the Application side.

In the NgDoc builder's side, it compiles all entities and then dynamically loads them in order to
correctly generate documentation and to provide you with access, e.g., to a page object
within its template. Before compiling, the builder removes some fields that cannot be existed
in Node environment, and fields that are not needed for building documentation
e.g., `demos` field or `target` field for playgrounds. So if you try to print `demos` field in your
template using `{{ '{{ NgDocPage.demos }}' | safe }}`, you will get an empty string.
