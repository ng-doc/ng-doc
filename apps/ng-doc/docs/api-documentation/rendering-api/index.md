---
keywords: RenderingApiPage
---

NgDoc supports rendering API information in your guides.

## API rendering

To render API information you can use the `NgDocApi` class that provides methods to generate
API tables and details for the provided declaration path.

### Api

The `NgDocApi.api` method generates API tables for the provided declaration path.

```twig name="index.md"
{{ '{{ NgDocApi.api("path/from/root/to/declaration.ts#MyClassName") }}' | safe }}
```

### Details

The `NgDocApi.details` method generates API details with information about generic types, decorators,
selectors, etc. based on the provided declaration type.

```twig name="index.md"
{{ '{{ NgDocApi.details("path/from/root/to/declaration.ts#MyClassName") }}' | safe }}
```

## JSDoc rendering

To render JSDoc comments you can use the `JSDoc` class that provides methods to display JSDoc comments
for the provided declaration path.

### Description

The `JSDoc.description` method returns the JSDoc description for the provided declaration path.

```twig name="index.md"
{{ '{{ JSDoc.description("path/from/root/to/declaration.ts#MyClassName") }}' | safe }}
```

### Tag

The `JSDoc.tag` method returns the JSDoc tag description for the provided declaration path.

```twig name="index.md"
{{ '{{ JSDoc.tag("path/from/root/to/declaration.ts#MyClassName", "deprecated") }}' | safe }}
```

### Tags

The `JSDoc.tags` returns an array of rendered JSDoc tags for the provided declaration path.
You can use this list to render all tags manually using nunjucks.

```twig name="index.md"
{{ '{% set tags = JSDoc.tags("path/from/root/to/declaration.ts#MyClassName", "see") %}' | safe }}

{{ '{% for tag in tags %}' | safe }}
{{ '{{ tag }}' | safe }}
{{ '{% endfor %}' | safe }}
```

### HasTag

The `JSDoc.hasTag` method returns true if the provided declaration path has the specified JSDoc tag.

```twig name="index.md"
{{ '{{ JSDoc.hasTag("path/from/root/to/declaration.ts#MyClassName", "deprecated") }}' | safe }}
```

{% index false %}

## See also

- `*AutoGenerationPage`
- `*DocumentingDeclarationsPage`

{% endindex %}
