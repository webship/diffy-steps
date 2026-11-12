# Then wait for diffy comparison to complete

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Wait until the last comparison created in this scenario is complete in Diffy. It polls every DIFFY_POLL_INTERVAL seconds, for at most DIFFY_MAX_WAIT seconds, and fails at once when Diffy stops the comparison. The result and the report link are added to the test report.

## Diffy API

GET diffs/{id} (polling)

## Gherkin step pattern

```
/^(I |we )*wait for diffy comparison to complete$/
```

## Examples

```gherkin
Then wait for diffy comparison to complete
And wait for diffy comparison to complete
Then I wait for diffy comparison to complete
Then we wait for diffy comparison to complete
And I wait for diffy comparison to complete
And we wait for diffy comparison to complete
But I wait for diffy comparison to complete
```
