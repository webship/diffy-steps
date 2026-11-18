<p align="center"><img src="https://raw.githubusercontent.com/webship/diffy-steps/2.0.x/assets/logo.svg" alt="Diffy logo" width="96"></p>

# @webship-js/diffy-steps

[![Test](https://github.com/webship/diffy-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/diffy-steps/actions/workflows/test.yml)

Step definitions for visual-regression testing with [Diffy](https://diffy.website), for [webship-js](https://www.npmjs.com/package/webship-js), the Playwright and Cucumber BDD framework. A scenario captures full-page screenshots of your site at several breakpoints, sends them to Diffy, compares two sets and states what it expects from the result:

```gherkin
Given I am on "/"
Then I take screenshots for all breakpoints
And send the screenshots for visual comparison with name "release-1.4"
Then create a visual comparison with name "release-1.4 against 1.3"
And the visual comparison should have at most "0" percent of pages changed
```

The pack is a plugin: it does not run on its own, and it needs a webship-js 2.x test project. It uses the Diffy REST API as documented in the [Diffy Swagger](https://app.diffy.website/rest) and has no dependency of its own (Node.js 20 or later).

## What is proven, and what needs a Diffy key

This repository's tests run in two lanes. Be clear about which one you rely on.

| Lane | Command | Runs against | Needs |
| --- | --- | --- | --- |
| Mock | `npm test` | a local mock of the Diffy API, started by the suite | nothing |
| Live | `npm run test:live` | `https://app.diffy.website/api/` | `DIFFY_API_KEY` and `DIFFY_PROJECT_ID` |

**Proven against the mock, in every CI run** (the steps, the client and the mock are tested together, and a request that does not match the contract fails the run):

- the routes, methods, payload field names and multipart layout of every call, as published in the Diffy Swagger and in Diffy's own PHP client and CLI;
- authentication: the key is exchanged for a bearer token, the token is renewed once when Diffy answers 401, and a wrong key or an account without API access gives a message that says what to do;
- polling: screenshot sets and comparisons are only complete after the documented states, a stopped comparison fails at once, and `DIFFY_MAX_WAIT` ends a wait with the last state;
- error handling: 400, 401, 403, 404, 429 (waits for `Retry-After`), 503 (a GET is retried, a change is not) and an unreachable Diffy;
- what a comparison reports: an unchanged page gives 0 percent, a changed page gives its share, and the steps that check the result pass and fail accordingly;
- uploads: image types, batches of ten, `functionalTest`, widths read from PNG and WebP files.

**Not proven without a key.** The mock is written from the same documents as the steps, so it cannot reveal a mistake in those documents or a difference between them and the running service. These points need a run of `npm run test:live`:

- that the real service accepts every request as the mock does, in particular `functionalTest` uploads of pages that are not in the project, and the append route for uploads of more than ten images (the Swagger documents `PUT snapshots/{id}`; Diffy's CLI sends `POST`; the pack tries `PUT` and falls back to `POST`);
- the response fields the Swagger does not describe and the pack reads from Diffy's PHP client: the token in `auth/key`, the `state` values and `result` of a comparison;
- real capture times and rate limits (the defaults are a wait of up to 20 minutes and a poll every 10 seconds);
- the steps that make Diffy capture your sites: they need a project with production and staging URLs that Diffy can reach.

No run against the real service has been made for this version. See [what the live lane needs](#the-live-lane).

## From nothing to a green run

What the machine needs: git and Node.js 20 or later with npm. No Diffy account:
the first run talks to the mock of the Diffy API that this repository's own
suite uses, started on its own.

**1. The site and the Diffy API.** The example pages of this repository (a
before and after pair, `examples/pages/baseline.html` and `changed.html`) and the
mock of the Diffy API, each in its own terminal:

```bash
git clone https://github.com/webship/diffy-steps.git
cd diffy-steps
npx http-server examples -p 8080 -s
```

```bash
cd diffy-steps
npm run mock
```

The pages answer at `http://localhost:8080`, and the mock prints
`Mock Diffy API at http://127.0.0.1:8790/api/ (key "mock-key", project 1001)`.
It needs no install (`node tests/serve-mock.js` is the same
command), keeps everything in memory and compares the uploaded images pixel by
pixel.

**2. A test project**, in a third terminal:

```bash
mkdir diffy-tests && cd diffy-tests
npm init -y
npm install --save-dev webship-js @webship-js/diffy-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the
`tests/` folders with a first feature and the `npm test` scripts, and installs
Chromium. npm usually runs it already when it installs webship-js; a second run
changes nothing.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step
files of webship-js and of the pack, the address of the pages, and the Diffy
settings of the mock. The suite needs no account of the site (see
[Test users](#test-users)).

```javascript
module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/diffy-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: ['tests/features/**/*.feature'],
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'http://localhost:8080',
      // The waits webship-js adds around each page, scenario and step (milliseconds).
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      // The mock of `npm run mock`. For the real service, delete baseUrl, apiKey,
      // projectId and pollInterval here and export DIFFY_API_KEY and DIFFY_PROJECT_ID.
      diffy: {
        baseUrl: 'http://127.0.0.1:8790/api/',
        apiKey: 'mock-key',
        projectId: 1001,
        breakpoints: '640,1200',
        pollInterval: 0.2,
      },
    },
  },
};
```

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: A changed page shows changes in the comparison
    Given the visual comparison project is reachable
    And I am on "/pages/baseline.html"
    When I take screenshots for all breakpoints
    And send the screenshots for visual comparison with name "first-run-baseline"
    And I am on "/pages/changed.html"
    And I take screenshots for all breakpoints
    And send the screenshots for visual comparison with name "first-run-changed"
    And create a visual comparison with name "first-run"
    And wait for the visual comparison to complete
    Then the visual comparison should have changes
```

**5. Run it.**

```bash
npm test
```

A green first run prints every step, then the summary (the starter feature of
`npx init-webship-js`, which checks the home page of the address, and the
scenario above, passed) and the HTML report it wrote:

```
2 scenarios (2 passed)
12 steps (12 passed)
0m02.452s (executing steps: 0m02.417s)
[webship-js] HTML report → …/diffy-tests/tests/reports/cucumber_report.html
```

From there, copy the features of [`tests/features/`](tests/features/) (they
also ship in the package, under
`node_modules/@webship-js/diffy-steps/tests/features/`): together they use every
step of the pack. Against the mock they all pass; against the real service they
need a project and, for some, environments Diffy can reach (see
[The live lane](#the-live-lane)).

### What the suite tests

The features of this repository run every step of the pack, and CI runs them on
every change against the mock of the Diffy API, with the unit tests of the mock
and of the client: capturing full-page screenshots at a width and at every
breakpoint, sending them as a screenshot set, uploading a folder of images,
making Diffy capture a project environment or a custom address, waiting for the
screenshots and for a comparison, comparing the last two sets, two named sets or
two environments, making a set the baseline, and checking the result (changes or
none, at most a share of the pages changed), with authentication, polling and
the errors of the API. What the mock cannot prove about the real service is in
[What is proven, and what needs a Diffy key](#what-is-proven-and-what-needs-a-diffy-key):
the mock follows the same documents as the steps. A run leaves nothing: the mock
keeps its sets and comparisons in memory.

## Installation

```bash
npm install --save-dev webship-js @webship-js/diffy-steps
```

Add the pack to the `require` list of your project's `cucumber.js`. Three files are loaded from one glob:

```javascript
module.exports = {
  default: {
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',                // webship-js core steps
      'node_modules/@webship-js/diffy-steps/tests/step-definitions/**/*.js',   // this pack
      'tests/step-definitions/**/*.js',                                        // your own steps, if any
    ],
    paths: ['tests/features/**/*.feature'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://your-site.example',
      diffy: {
        projectId: 0,              // or DIFFY_PROJECT_ID
        breakpoints: '640,1200',   // or DIFFY_BREAKPOINTS; use widths your Diffy project has
      },
    },
  },
};
```

Settings resolve in this order: `DIFFY_*` environment variables, then `worldParameters.diffy` in `cucumber.js`, then the defaults. **Never commit an API key.** Keep it in a CI secret or a git-ignored `.env.local` and export `DIFFY_API_KEY`.

| Variable | Purpose | Default |
| --- | --- | --- |
| `DIFFY_API_KEY` | Diffy API key ([keys page](https://app.diffy.website/#/keys)); the account needs API access | *required* |
| `DIFFY_PROJECT_ID` | Diffy project id (the number in the project's URL) | *required* |
| `DIFFY_BREAKPOINTS` | Comma list of widths, for example `640,1200` | `1200` |
| `DIFFY_WINDOW_HEIGHT` | Viewport height in pixels | `2000` |
| `DIFFY_SCREENSHOTS_DIR` | Keep a copy of the captured screenshots here (debugging); after an upload only the files the pack wrote are removed | *unset* |
| `DIFFY_API_BASE_URL` | Another Diffy address | `https://app.diffy.website/api/` |
| `DIFFY_MAX_WAIT` | Seconds a wait step polls before it fails | `1200` |
| `DIFFY_POLL_INTERVAL` | Seconds between polls | `10` |
| `DIFFY_REQUEST_TIMEOUT` | Seconds one API call may take | `120` |
| `DIFFY_FUNCTIONAL_TEST` | Upload screenshots as functional-test uploads, so their pages need not be in the project's URL list. Use `false` to require them | `true` |
| `DIFFY_COMMIT_SHA` | Commit SHA sent with an environment comparison (GitHub check) | *unset* |
| `DIFFY_ENV1_URL`, `DIFFY_ENV2_URL` | Address of a `custom` environment; `DIFFY_ENV1_URL` is also the address for `create a visual screenshot from the "custom" environment` | *unset* |
| `DIFFY_ENV1_USER`, `DIFFY_ENV1_PASS`, `DIFFY_ENV2_USER`, `DIFFY_ENV2_PASS` | Basic-authentication login of a `custom` environment | *unset* |

## Test users

None. The suite captures the example pages of this repository (`examples/`),
which have no sign-in, and `cucumber.js` lists no accounts (its
`worldParameters` has no `users`); no scenario signs in. Diffy itself is
reached with an API key (`DIFFY_API_KEY`), not with an account the suite signs
in with, and the mock lane needs no key at all. The JSON of the accounts is
empty:

```json
{}
```

## Steps

Every step has a page in [docs/steps](docs/README.md) with its description, pattern and examples. The pronouns `I` and `we` are optional in steps that act (`I take screenshot`, `we take screenshot` and `take screenshot` are the same step).

| Step | Diffy API call |
| --- | --- |
| `When I resize window to "<width>"` | none (browser viewport) |
| `Then I take screenshot` | none (full-page capture, kept until it is sent) |
| `Then I take screenshots for all breakpoints` | none (one capture per `DIFFY_BREAKPOINTS` width) |
| `Then send the screenshots for visual comparison with name "<name>"` | `POST projects/{id}/create-custom-snapshot` |
| `Then upload the folder "<path>" for visual comparison as "<name>"` | `POST projects/{id}/create-custom-snapshot` |
| `Then create a visual screenshot from the "<environment>" environment` | `POST projects/{id}/screenshots` |
| `Then create a visual screenshot from the custom environment "<url>"` | `POST projects/{id}/screenshots` |
| `Then wait for the visual screenshots to complete` | `GET snapshots/{id}` (polling) |
| `Then create a visual comparison` | `POST projects/{id}/diffs` |
| `Then create a visual comparison with name "<name>"` | `POST projects/{id}/diffs` |
| `Then visually compare "<env1>" with "<env2>"` (optional `with name "<name>"`) | `POST projects/{id}/compare` |
| `Then wait for the visual comparison to complete` | `GET diffs/{id}` (polling) |
| `Then the visual comparison should (not) have changes` | `GET diffs/{id}` |
| `Then the visual comparison should have at most "<n>" percent of pages changed` | `GET diffs/{id}` |
| `Then set the last visual screenshots as the baseline` | `PUT projects/{id}/set-base-line-set/{id}` |
| `Then the visual comparison project should be reachable` | `GET projects/{id}` |

Authentication is `POST auth/key` with the API key; its token is sent as a bearer token on every other call.

### Earlier wording (deprecated)

The steps used to name the service in their wording. They read "visual comparison" now; the earlier wording still works for one more release, runs the same step and prints, once per run, the wording that replaces it:

| Earlier wording (deprecated) | Now |
| --- | --- |
| `send screenshots to diffy with name "<name>"` | `send the screenshots for visual comparison with name "<name>"` |
| `upload folder "<path>" to diffy as "<name>"` | `upload the folder "<path>" for visual comparison as "<name>"` |
| `create diffy screenshot from "<environment>" environment` | `create a visual screenshot from the "<environment>" environment` |
| `create diffy screenshot from the custom environment "<url>"` | `create a visual screenshot from the custom environment "<url>"` |
| `wait for diffy screenshots to complete` | `wait for the visual screenshots to complete` |
| `create diffy comparison` | `create a visual comparison` |
| `create diffy comparison with name "<name>"` | `create a visual comparison with name "<name>"` |
| `compare diffy "<env1>" with "<env2>"` | `visually compare "<env1>" with "<env2>"` |
| `wait for diffy comparison to complete` | `wait for the visual comparison to complete` |
| `the diffy comparison should (not) have changes` | `the visual comparison should (not) have changes` |
| `the diffy comparison should have at most "<n>" percent of pages changed` | `the visual comparison should have at most "<n>" percent of pages changed` |
| `set the last diffy screenshots as the baseline` | `set the last visual screenshots as the baseline` |
| `the diffy project is reachable` / `should be reachable` | `the visual comparison project is reachable` / `should be reachable` |

### Two ways to get a screenshot set

- **Capture with Playwright** (`take screenshot`, then `send the screenshots for visual comparison`, or `upload the folder`). Your site does not need to be reachable from Diffy, which makes it the way to test a local, private or pre-release site. Rendering is done by your browser, not by Diffy.
- **Let Diffy capture** (`create a visual screenshot from the ... environment`, `visually compare ... with ...`). Diffy renders the project's pages from the project's environment URLs or from a `custom` address; the site must be reachable from Diffy (see [Diffy's allow-list](https://docs.diffy.website/features/welcome)).

### Errors

A failed call says what Diffy answered and what to change:

```
Diffy did not accept the API key.
  Why: Unknown key
  Hint: Create a key at https://app.diffy.website/#/keys and export it as DIFFY_API_KEY. A key only works against the Diffy address it was made for (DIFFY_API_BASE_URL, now https://app.diffy.website/api/).
```

### Not covered

Diffy settings such as notifications, masks, schedules and cookies belong to the project and are changed in Diffy or through `POST projects/{id}`; this pack runs and checks comparisons and does not edit projects.

## Running this repository's own suite

```bash
npm install
npx playwright install --with-deps chromium
npm run test:unit      # the mock and the client, without a browser
npm run test:examples  # docblock examples against the step patterns, features against the steps
npm run docs:check     # the pages in docs/ against the docblocks
npm test               # the features, mock lane
```

The mock follows the Diffy Swagger and the state values of the [Diffy PHP client](https://github.com/DiffyWebsite/diffy-php): validated payloads, bearer authentication with an expiring token, screenshots and comparisons that complete after polling, and a result computed from the uploaded images pixel by pixel. The suite serves `examples/` on the port of `LAUNCH_URL` (default `http://localhost:8080`; set `LAUNCH_URL` to another port when 8080 is taken).

### The live lane

`npm run test:live` runs the same features against the real service. Without a key it prints why it skipped and exits with 0. To run it, provide:

| What | Why |
| --- | --- |
| `DIFFY_API_KEY` | A key of an account with API access (the Swagger says a paid plan or a coupon). |
| `DIFFY_PROJECT_ID` | A Diffy project made for testing: the runs create screenshot sets and comparisons in it. Its breakpoints should include the widths of `DIFFY_BREAKPOINTS` (default `640,1200`). |
| `DIFFY_LIVE_PROJECT_ENVIRONMENTS=1` | Optional. Also runs the scenarios that make Diffy capture the project's production and staging URLs; they must be set in the project and reachable by Diffy. |
| `DIFFY_ENV1_URL`, `DIFFY_ENV2_URL` | Optional. Two addresses Diffy can reach, for the `custom` environment scenarios. |
| `DIFFY_LIVE_SET_BASELINE=1` | Optional. Also runs the scenario that replaces the project's baseline. |

In CI, the `live` job of the workflow reads the secret `DIFFY_API_KEY` and the variable `DIFFY_PROJECT_ID` of the repository; without them it skips with the same message.

| Script | Effect |
| --- | --- |
| `npm test` | All features, mock lane |
| `npm run test:live` | All features, real Diffy API |
| `npm run test:unit` | The mock and the client |
| `npm run test:examples` | Checks docblocks, step patterns and features |
| `npm run docs` / `npm run docs:check` | Write / check `docs/steps` |
| `npm run test:dry` | `--dry-run`: undefined or ambiguous steps only |
| `npm run test:paths` | Checks that a feature or a scenario named on the command line runs alone (`npx cucumber-js tests/features/01-example-demo.feature`, or `…feature:<line>` for one scenario) |
| `npm run test:headed`, `test:chromium`, `test:firefox`, `test:webkit` | Choose how the browser runs |
| `npm start` | Serve `examples/` on port 8080 |
| `npm run mock` | Serve the mock of the Diffy API on its own, at `http://127.0.0.1:8790/api/` (`DIFFY_MOCK_PORT` changes the port) |

More: [deep reference and adoption walkthrough](tests/step-definitions/README.md).

## Example pages

`examples/pages/baseline.html` and `examples/pages/changed.html` are a deliberate before and after pair: the changed page shifts the palette, adds a badge and a section, and alters the pricing, so a comparison has real differences to report. `examples/pages/index.html` links both.

## Contributing

Issues and pull requests are tracked on GitHub. `2.0.x` is the single active branch, for the webship-js 2.0.x line.

## Credits

Extracted from [webship-js](https://github.com/webship/webship-js), where these steps first shipped as an optional layer. The Diffy contract is taken from [Diffy's Swagger](https://app.diffy.website/rest) and its open-source [PHP client](https://github.com/DiffyWebsite/diffy-php) and [CLI](https://github.com/DiffyWebsite/diffy-cli).

## License

MIT © Webship.co — see [LICENSE](LICENSE).

## Logo

The Diffy logo in this README is the favicon of diffy.website and belongs to Diffy. The Diffy name and logo are trademarks of their owner; this pack is not affiliated with or endorsed by them.
