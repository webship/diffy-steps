# When I resize window to "<value>"

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Resize the browser viewport to a breakpoint width, so a page is laid out at that width. The height is DIFFY_WINDOW_HEIGHT.

## Diffy API

none (Playwright viewport)

## Gherkin step pattern

```
/^(I |we )*resize window to "([^"]*)"$/
```

## Examples

```gherkin
When I resize window to "1200"
When we resize window to "640"
When I resize window to "320"
When we resize window to "768"
When I resize window to "1024"
When we resize window to "1440"
When I resize window to "1920"
When we resize window to "375"
```
