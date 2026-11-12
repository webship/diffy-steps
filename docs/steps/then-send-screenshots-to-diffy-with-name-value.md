# Then send screenshots to diffy with name "<value>"

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Upload the captured screenshots to Diffy as one named screenshot set. The set is marked as a functional-test upload, so the pages need not be in the project URL list (DIFFY_FUNCTIONAL_TEST=false turns that off). More than ten images are sent in batches. On success the captured screenshots, and the files this pack wrote to DIFFY_SCREENSHOTS_DIR, are cleared.

## Diffy API

POST projects/{id}/create-custom-snapshot (multipart), and PUT snapshots/{id} for batches after the first ten images

## Gherkin step pattern

```
/^(I |we )*send screenshots to diffy with name "([^"]*)"$/
```

## Examples

```gherkin
Then send screenshots to diffy with name "baseline"
Then send screenshots to diffy with name "changed"
Then send screenshots to diffy with name "homepage-release-2.0"
Then send screenshots to diffy with name "after-deploy"
Then send screenshots to diffy with name "smoke-run"
Then send screenshots to diffy with name "webship.co-prod"
```
