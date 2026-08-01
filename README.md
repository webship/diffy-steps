# @webship/diffy-steps

[![Test](https://github.com/webship/diffy-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/diffy-steps/actions/workflows/test.yml)

Diffy-specific Cucumber step definitions for [webship-js](https://www.npmjs.com/package/webship-js) — a Playwright + Cucumber BDD testing framework. `@webship/diffy-steps` adds a `diffy.steps.js` step-pack that captures full-page Playwright screenshots at multiple breakpoints and drives [Diffy](https://diffy.website) visual-regression comparisons through the Diffy REST API, so you can express visual checks as readable Gherkin instead of hand-rolling API calls.

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
npm install --save-dev webship-js @webship/diffy-steps
```

Add both step-definition paths to your project's `cucumber.js`:

```javascript
module.exports = {
  default: {
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js', // webship-js core steps
      'node_modules/@webship/diffy-steps/tests/step-definitions/**/*.js', // this plugin
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

Per-step documentation: [docs/](docs/).

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `DIFFY_API_KEY` | Diffy API key ([keys page](https://app.diffy.website/#/keys)) | *required for real runs* |
| `DIFFY_PROJECT_ID` | Diffy project id | *required for real runs* |
| `DIFFY_BREAKPOINTS` | Comma list of breakpoints, e.g. `"640,1200"` | `1200` |
| `DIFFY_WINDOW_HEIGHT` | Default viewport height | `2000` |
| `DIFFY_SCREENSHOTS_DIR` | On-disk copy of screenshots (debugging) | *unset* |
| `DIFFY_API_BASE_URL` | Override the API base URL (used for mocking) | `https://app.diffy.website/api/` |
| `DIFFY_MAX_WAIT` | Seconds to poll `diffs/{id}` before failing | `1200` |
| `DIFFY_ENV1_URL` | Custom env1 URL for `compare diffy "custom" with ...` | *unset* |
| `DIFFY_ENV2_URL` | Custom env2 URL for `compare diffy ... with "custom"` | *unset* |

## Running this repo's own test suite

This repository is itself a working webship-js project. Its features run against the bundled example pages in `examples/diffy/` and a **local mock Diffy API** (`tests/support/mock-diffy-api/`), so the default run needs no Diffy account and no network access.

```bash
npm install
npx playwright install --with-deps chromium
npm start &          # serves examples/ on http://localhost:8080
npm test             # mock Diffy API, @real-api scenarios excluded
```

Against the real Diffy API:

```bash
export DIFFY_API_KEY="your-key"
export DIFFY_PROJECT_ID="30542"
export DIFFY_API_BASE_URL="https://app.diffy.website/api/"
export DIFFY_BREAKPOINTS="640,1200"
npx cucumber-js --tags "@real-api"
```

The project's allowed URLs must cover `LAUNCH_URL` — expose the local `examples/` through a tunnel, or point `LAUNCH_URL` at a hosted copy.

Other scripts:

| Script | Effect |
| --- | --- |
| `npm test` | Full suite, pretty output, mock Diffy API |
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
