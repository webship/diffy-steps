# Then set the last diffy screenshots as the baseline

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Make the last screenshot set of this scenario the baseline of the Diffy project, which "compare diffy ... with "baseline"" compares against. This replaces the baseline the project had.

## Diffy API

PUT projects/{id}/set-base-line-set/{screenshotId}

## Gherkin step pattern

```
/^(I |we )*set the last diffy screenshots as the baseline$/
```

## Examples

```gherkin
Then set the last diffy screenshots as the baseline
And set the last diffy screenshots as the baseline
Then I set the last diffy screenshots as the baseline
Then we set the last diffy screenshots as the baseline
And I set the last diffy screenshots as the baseline
But we set the last diffy screenshots as the baseline
```
