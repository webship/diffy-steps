# Then upload folder "<value>" to diffy as "<value>"

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Upload every PNG and WebP image under a local folder as one named screenshot set, the way Diffy's own CLI does. The breakpoint is the width of the image, and the URL Diffy files it under comes from its path: "home/Page One.png" becomes "/home-page-one". The set is a functional-test upload.

## Diffy API

POST projects/{id}/create-custom-snapshot (multipart), and PUT snapshots/{id} for batches after the first ten images

## Gherkin step pattern

```
/^(I |we )*upload folder "([^"]*)" to diffy as "([^"]*)"$/
```

## Examples

```gherkin
Then upload folder "./screenshots/baseline" to diffy as "baseline"
Then upload folder "./screenshots/changed" to diffy as "changed"
Then upload folder "./reports/screenshots" to diffy as "nightly"
Then upload folder "/tmp/webship-shots" to diffy as "webship.co-snapshot"
Then upload folder "./out/homepage" to diffy as "homepage-release-2.0"
Then upload folder "./diffy/before" to diffy as "before-deploy"
```
