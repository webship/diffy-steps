# Then the diffy comparison should have at most "<value>" percent of pages changed

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Assert that the share of pages that changed in the last comparison, as Diffy reports it in percent, is at most a number. Use "0" for no change at all. The comparison is waited for when no step has waited for it.

## Diffy API

GET diffs/{id}

## Gherkin step pattern

```
/^the diffy comparison should have at most "([^"]*)" percent of pages changed$/
```

## Examples

```gherkin
Then the diffy comparison should have at most "0" percent of pages changed
And the diffy comparison should have at most "5" percent of pages changed
Then the diffy comparison should have at most "10" percent of pages changed
And the diffy comparison should have at most "25" percent of pages changed
Then the diffy comparison should have at most "100" percent of pages changed
```
