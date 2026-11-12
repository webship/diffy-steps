# @webship-js/diffy-steps

[![Test](https://github.com/webship/diffy-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/diffy-steps/actions/workflows/test.yml)

Diffy-specific Cucumber step definitions for [webship-js](https://www.npmjs.com/package/webship-js) — a Playwright + Cucumber BDD testing framework. `@webship-js/diffy-steps` adds a `diffy.steps.js` step-pack that captures full-page Playwright screenshots at multiple breakpoints and drives [Diffy](https://diffy.website) visual-regression comparisons through the Diffy REST API, so you can express visual checks as readable Gherkin instead of hand-rolling API calls.

It is a **plugin for webship-js** — it does not run standalone. It ships one file of step definitions; you drop it into an existing (or new) webship-js test project.

## What's covered

- Viewport resizing and full-page screenshot capture, buffered in the World
- Breakpoint loops driven by `DIFFY_BREAKPOINTS`
- Custom snapshot upload (`create-custom-snapshot`, multipart)
- Diff creation, named and unnamed
- Server-side environment screenshots and env-to-env comparison
- Folder upload of pre-existing PNGs
- Diff polling until the comparison completes

See [tests/step-definitions/diffy.steps.js](tests/step-definitions/diffy.steps.js) for the full list of steps with Gherkin examples, and [tests/step-definitions/README.md](tests/step-definitions/README.md) for the adoption guide, the environment-variable table, and the Diffy API reference.

## Requirements

- Node.js >= 20
- An existing [webship-js](https://www.npmjs.com/package/webship-js) 2.x test project (or run `npx init-webship-js` to create one)
- A [Diffy](https://app.diffy.website) account, project id, and API key — for real comparisons. The bundled mock server covers local development without one.

## Installation

```bash
npm install --save-dev webship-js @webship-js/diffy-steps
```

Add both step-definition paths to your project's `cucumber.js`:

```javascript
module.exports = {
  default: {
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js', // webship-js core steps
      'node_modules/@webship-js/diffy-steps/tests/step-definitions/**/*.js', // this plugin
      'tests/step-definitions/**/*.js', // your own custom steps, if any
    ],
    paths: ['tests/features/**/*.feature'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://your-site.example',
      diffy: {
        apiKey: '',                                 // prefer DIFFY_API_KEY
        projectId: 0,                               // DIFFY_PROJECT_ID
        breakpoints: '640,1200',                    // DIFFY_BREAKPOINTS
        baseUrl: 'https://app.diffy.website/api/',  // DIFFY_API_BASE_URL
      },
    },
  },
};
```

Configuration resolves in this order, highest first:

1. `process.env.DIFFY_*`
2. `cucumber.js` `worldParameters.diffy.*`
3. built-in defaults

**Never commit an API key.** Put it in CI secrets or a git-ignored `.env.local` and export `DIFFY_API_KEY`.

## Quick example

```gherkin
Feature: Visual regression

  @diffy
  Scenario: Compare two pages across breakpoints
    Given I am on "/"
    Then I take screenshots for all breakpoints
    And send screenshots to diffy with name "baseline"

    Given I am on "/about-us"
    Then I take screenshots for all breakpoints
    And send screenshots to diffy with name "feature-branch"

    Then create diffy comparison with name "PR-42"
    And wait for diffy comparison to complete
```

More runnable examples: [tests/features/](tests/features/).

## Steps

| Step | Diffy API call |
|------|----------------|
| `When I resize window to "<px>"` | — (Playwright viewport) |
| `Then I take screenshot` | — (buffered in World) |
| `Then I take screenshots for all breakpoints` | — (loops `DIFFY_BREAKPOINTS`) |
| `Then send screenshots to diffy with name "<name>"` | `POST projects/{id}/create-custom-snapshot` |
| `Then create diffy comparison` | `POST projects/{id}/diffs` |
| `Then create diffy comparison with name "<name>"` | `POST projects/{id}/diffs` |
| `Then create diffy screenshot from "<env>" environment` | `POST projects/{id}/screenshots` |
| `Then compare diffy "<env1>" with "<env2>"` | `POST projects/{id}/compare` |
| `Then upload folder "<path>" to diffy as "<name>"` | `POST projects/{id}/create-custom-snapshot` |
| `Then wait for diffy comparison to complete` | `GET diffs/{id}` (polling) |
| `Then wait for diffy screenshots to complete` | `GET snapshots/{id}` (polling) |
| `Then the diffy comparison should (not) have changes` | `GET diffs/{id}` (`result`, `diffs`) |
| `Then the diffy comparison should have at most "<n>" percent of pages changed` | `GET diffs/{id}` (`result`) |
| `Then set the last diffy screenshots as the baseline` | `PUT projects/{id}/set-base-line-set/{screenshotId}` |
| `Then the diffy project should be reachable` | `GET projects/{id}` |

Per-step documentation: [docs/](docs/).

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `DIFFY_API_KEY` | Diffy API key ([keys page](https://app.diffy.website/#/keys)); the account needs API access | *required* |
| `DIFFY_PROJECT_ID` | Diffy project id | *required* |
| `DIFFY_BREAKPOINTS` | Comma list of breakpoints, e.g. `"640,1200"` | `1200` |
| `DIFFY_WINDOW_HEIGHT` | Viewport height in pixels | `2000` |
| `DIFFY_SCREENSHOTS_DIR` | On-disk copy of the captured screenshots (debugging); only files the pack wrote are removed after an upload | *unset* |
| `DIFFY_API_BASE_URL` | Override the API base URL | `https://app.diffy.website/api/` |
| `DIFFY_MAX_WAIT` | Seconds a wait step polls before failing | `1200` |
| `DIFFY_POLL_INTERVAL` | Seconds between polls | `10` |
| `DIFFY_REQUEST_TIMEOUT` | Seconds one API call may take | `120` |
| `DIFFY_FUNCTIONAL_TEST` | Mark uploaded screenshots as functional-test uploads, so their pages need not be in the project URL list. `false` to require the pages in the project | `true` |
| `DIFFY_COMMIT_SHA` | Commit SHA sent with environment comparisons (GitHub check) | *unset* |
| `DIFFY_ENV1_URL`, `DIFFY_ENV2_URL` | Address of a `custom` environment (`compare diffy "custom" with ...`; `DIFFY_ENV1_URL` also for `create diffy screenshot from "custom" environment`) | *unset* |
| `DIFFY_ENV1_USER`, `DIFFY_ENV1_PASS`, `DIFFY_ENV2_USER`, `DIFFY_ENV2_PASS` | Basic-authentication login of a `custom` environment | *unset* |

## Running this repo's own test suite

This repository is itself a working webship-js project. Its features run in two lanes.

| Lane | Command | Talks to | Needs |
| --- | --- | --- | --- |
| Mock | `npm test` | a local mock of the Diffy API, started by the suite | nothing |
| Live | `npm run test:live` | `https://app.diffy.website/api/` | `DIFFY_API_KEY` and `DIFFY_PROJECT_ID` |

```bash
npm install
npx playwright install --with-deps chromium
npm run test:unit    # the mock itself, checked against the documented contract
npm test             # the features, mock lane (the example pages are served by the suite)
```

The mock follows the [Diffy Swagger](https://app.diffy.website/rest/swagger.json) and the state values of the official [Diffy PHP client](https://github.com/DiffyWebsite/diffy-php): bearer authentication with an expiring token, validated payloads, screenshots and diffs that are only complete after some polling, and a diff result computed from the images. A request that does not match the contract fails the run.

The live lane runs the same features against the real service. Without a key it prints why it skipped and exits with 0:

```bash
export DIFFY_API_KEY="your-key"       # https://app.diffy.website/#/keys (the account needs API access)
export DIFFY_PROJECT_ID="30542"
npm run test:live
```

Scenarios that need a project with production and staging URLs Diffy can reach are skipped in the live lane unless `DIFFY_LIVE_PROJECT_ENVIRONMENTS=1` is set; scenarios that need two public URLs unless `DIFFY_ENV1_URL` and `DIFFY_ENV2_URL` are set; the scenario that replaces the project's baseline unless `DIFFY_LIVE_SET_BASELINE=1` (use a project made for testing).

The suite serves `examples/` itself on the port of `LAUNCH_URL` (default `http://localhost:8080`). Set `LAUNCH_URL` to another port if 8080 is taken.

Other scripts:

| Script | Effect |
| --- | --- |
| `npm test` | Full suite, pretty output, mock lane |
| `npm run test:live` | The same features against the real Diffy API |
| `npm run test:unit` | Checks of the mock against the documented contract |
| `npm run test:dry` | `--dry-run` — checks for undefined/ambiguous steps only |
| `npm run test:headed` | Headed browser |
| `npm run test:chromium` / `test:firefox` / `test:webkit` | Pick a browser |
| `npm start` | Serve `examples/` on `:8080` |

## Example pages

`examples/diffy/baseline.html` and `examples/diffy/changed.html` are a deliberate before/after pair — the changed page shifts the palette, adds a badge and a section, and alters pricing, so Diffy has real differences to report. `examples/diffy/index.html` links both.

## Contributing

Issues and pull requests are tracked on GitHub. `2.0.x` is the repository's single active branch, tracking the webship-js 2.0.x line.

## Credits

Extracted from [webship-js](https://github.com/webship/webship-js), where these steps first shipped as the opt-in `tests/step-definitions-diffy/` layer.

## License

MIT © Webship.co — see [LICENSE](LICENSE).
