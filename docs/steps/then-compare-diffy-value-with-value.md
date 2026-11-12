# Then compare diffy "<value>" with "<value>"

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Let Diffy capture two environments of the project and compare them. The environments are prod, stage, dev, baseline and custom (long names work as well). For "custom" the address comes from DIFFY_ENV1_URL or DIFFY_ENV2_URL, with DIFFY_ENV1_USER and DIFFY_ENV1_PASS (or ENV2) for basic authentication. DIFFY_COMMIT_SHA is sent along for a GitHub check. An optional name labels the comparison.

## Diffy API

POST projects/{id}/compare

## Gherkin step pattern

```
/^(I |we )*compare diffy "([^"]*)" with "([^"]*)"(?: with name "([^"]*)")?$/
```

## Examples

```gherkin
Then compare diffy "prod" with "stage"
Then compare diffy "production" with "staging"
Then compare diffy "prod" with "dev"
Then compare diffy "stage" with "dev" with name "release-2.0"
Then compare diffy "prod" with "baseline"
Then compare diffy "baseline" with "custom"
Then compare diffy "custom" with "custom"
Then compare diffy "production" with "development"
```
