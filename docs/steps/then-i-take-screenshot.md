# Then I take screenshot

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Capture a full-page screenshot of the current page at the current viewport width. The page is settled first and animations are stopped. The image is kept in memory (and in DIFFY_SCREENSHOTS_DIR when set) until "send screenshots to diffy with name" uploads the batch. Taking the same page at the same width again replaces the earlier image.

## Diffy API

none (Playwright screenshot, kept in memory until it is sent)

## Gherkin step pattern

```
/^(I |we )*take screenshot$/
```

## Examples

```gherkin
Then I take screenshot
Then we take screenshot
And I take screenshot
And we take screenshot
But I take screenshot
Then take screenshot
And take screenshot
```
