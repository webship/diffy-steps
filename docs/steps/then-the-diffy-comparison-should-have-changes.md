# Then the diffy comparison should have changes

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Assert that the last comparison found changes, or found none. "Changes" means Diffy reports a percentage of changed pages above zero, or any page with changed pixels. The comparison is waited for when no step has waited for it. A failure lists the changed pages and the report link.

## Diffy API

GET diffs/{id}

## Gherkin step pattern

```
/^the diffy comparison should( not)* have changes$/
```

## Examples

```gherkin
Then the diffy comparison should have changes
And the diffy comparison should have changes
Then the diffy comparison should not have changes
And the diffy comparison should not have changes
But the diffy comparison should not have changes
```
