# Then wait for diffy screenshots to complete

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Wait until the last screenshot set of this scenario is complete in Diffy. Needed after "create diffy screenshot from ... environment", which only starts the capture; an uploaded set needs no waiting for. It polls every DIFFY_POLL_INTERVAL seconds, for at most DIFFY_MAX_WAIT seconds.

## Diffy API

GET snapshots/{id} (polling)

## Gherkin step pattern

```
/^(I |we )*wait for diffy screenshots to complete$/
```

## Examples

```gherkin
Then wait for diffy screenshots to complete
And wait for diffy screenshots to complete
Then I wait for diffy screenshots to complete
Then we wait for diffy screenshots to complete
And I wait for diffy screenshots to complete
But we wait for diffy screenshots to complete
```
