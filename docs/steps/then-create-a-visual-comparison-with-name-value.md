# Then create a visual comparison with name "<value>"

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Compare the last two screenshot sets of this scenario in Diffy and give the comparison a name, which Diffy shows in its list and in notifications.

## Diffy API

POST projects/{id}/diffs

## Gherkin step pattern

```
/^(I |we )*create (?:a )?visual comparison with name "([^"]*)"$/
```

## Examples

```gherkin
Then create a visual comparison with name "release-2.0"
Then create a visual comparison with name "nightly"
Then create a visual comparison with name "smoke-run-42"
Then create a visual comparison with name "webship.co-regression"
Then create a visual comparison with name "before-vs-after"
Then create a visual comparison with name "homepage-baseline-vs-changed"
```
