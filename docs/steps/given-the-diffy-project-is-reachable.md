# Given the diffy project is reachable

> Generated from the docblock of the step in `tests/step-definitions/diffy.steps.js`. Edit the docblock and run `npm run docs`.

## Overview

Check that the Diffy API key, the account's API access and the project id work together, by reading the project. Put it first in a feature so a wrong key or project id fails with a hint before any capture is made.

## Diffy API

GET projects/{id}

## Gherkin step pattern

```
/^the diffy project (?:is|should be) reachable$/
```

## Examples

```gherkin
Given the diffy project is reachable
Then the diffy project should be reachable
And the diffy project is reachable
And the diffy project should be reachable
But the diffy project is reachable
```
