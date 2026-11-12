# Then create diffy screenshot from the custom environment "<value>"

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Ask Diffy to capture the project's pages from a site at an address you give, the custom environment. The site must be reachable from Diffy.

## Diffy API

POST projects/{id}/screenshots

## Gherkin step pattern

```
/^(I |we )*create diffy screenshot from the custom environment "([^"]*)"$/
```

## Examples

```gherkin
Then create diffy screenshot from the custom environment "https://stage.example.org"
And create diffy screenshot from the custom environment "https://www.un.org"
Then I create diffy screenshot from the custom environment "https://pr-42.example.org"
Then we create diffy screenshot from the custom environment "https://example.org"
But I create diffy screenshot from the custom environment "https://example.net"
```
