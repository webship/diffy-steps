# Then create diffy screenshot from "<value>" environment

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Ask Diffy to capture the project's pages from one of the project's environments. Accepts short (prod, stage, dev) or long (production, staging, development) names, and "custom", which captures DIFFY_ENV1_URL.

## Diffy API

POST projects/{id}/screenshots

## Gherkin step pattern

```
/^(I |we )*create diffy screenshot from "([^"]*)" environment$/
```

## Examples

```gherkin
Then create diffy screenshot from "production" environment
Then create diffy screenshot from "prod" environment
Then create diffy screenshot from "staging" environment
Then create diffy screenshot from "stage" environment
Then create diffy screenshot from "development" environment
Then create diffy screenshot from "dev" environment
Then create diffy screenshot from "custom" environment
```
