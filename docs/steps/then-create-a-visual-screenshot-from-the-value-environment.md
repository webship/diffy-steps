# Then create a visual screenshot from the "<value>" environment

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Ask Diffy to capture the project's pages from one of the project's environments. Accepts short (prod, stage, dev) or long (production, staging, development) names, and "custom", which captures DIFFY_ENV1_URL.

## Diffy API

POST projects/{id}/screenshots

## Gherkin step pattern

```
/^(I |we )*create (?:a )?visual screenshot from (?:the )?"([^"]*)" environment$/
```

## Examples

```gherkin
Then create a visual screenshot from the "production" environment
Then create a visual screenshot from the "prod" environment
Then create a visual screenshot from the "staging" environment
Then create a visual screenshot from the "stage" environment
Then create a visual screenshot from the "development" environment
Then create a visual screenshot from the "dev" environment
Then create a visual screenshot from the "custom" environment
```
