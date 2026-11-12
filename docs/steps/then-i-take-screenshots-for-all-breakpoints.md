# Then I take screenshots for all breakpoints

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Resize to each configured breakpoint and capture the current page at each. The breakpoints come from DIFFY_BREAKPOINTS or worldParameters.diffy.breakpoints.

## Diffy API

none (Playwright screenshots, kept in memory until they are sent)

## Gherkin step pattern

```
/^(I |we )*take screenshots for all breakpoints$/
```

## Examples

```gherkin
Then I take screenshots for all breakpoints
Then we take screenshots for all breakpoints
And I take screenshots for all breakpoints
And we take screenshots for all breakpoints
Then take screenshots for all breakpoints
And take screenshots for all breakpoints
```
