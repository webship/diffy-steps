# Then upload the folder "<value>" for visual comparison as "<value>"

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Upload every PNG and WebP image under a local folder as one named screenshot set, the way Diffy's own CLI does. The breakpoint is the width of the image, and the URL Diffy files it under comes from its path: "home/Page One.png" becomes "/home-page-one". The set is a functional-test upload.

## Diffy API

POST projects/{id}/create-custom-snapshot (multipart), and PUT snapshots/{id} for batches after the first ten images

## Gherkin step pattern

```
/^(I |we )*upload (?:the )?folder "([^"]*)" for visual comparison as "([^"]*)"$/
```

## Examples

```gherkin
Then upload the folder "./screenshots/baseline" for visual comparison as "baseline"
Then upload the folder "./screenshots/changed" for visual comparison as "changed"
Then upload the folder "./reports/screenshots" for visual comparison as "nightly"
Then upload the folder "/tmp/webship-shots" for visual comparison as "webship.co-snapshot"
Then upload the folder "./out/homepage" for visual comparison as "homepage-release-2.0"
Then upload the folder "./visual/before" for visual comparison as "before-deploy"
```
