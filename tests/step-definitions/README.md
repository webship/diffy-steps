# Diffy step definitions — deep reference

Captures screenshots with Playwright and uploads them to
[Diffy](https://diffy.website) for visual-regression comparison via the Diffy
REST API (`https://app.diffy.website/api/`).

`diffy.steps.js` is the one file this package publishes to npm. Everything else
in the repository is the working test project that exercises it.

For installation and the quick tour, read the [root README](../../README.md).
This page is the deep reference: the adoption walkthrough, the full environment
variable table, the Diffy REST API endpoint map, the Diffy-side IP allow-list,
and links into Diffy's own documentation.

## Adopt Diffy in a webship-js test project

> New to webship-js in your own project? First install and wire it up using
> the official docs:
>
> - **Install Webship JS** — https://webship.co/docs/webship-js/2.0.x/install-webship-js
> - **Global Settings (`cucumber.js`)** — https://webship.co/docs/webship-js/2.0.x/global-settings
> - **Step Definitions** — https://webship.co/docs/webship-js/2.0.x/step-definitions
>
> Once webship-js is running in your project, the steps below add the Diffy
> layer on top.

Install the plugin alongside webship-js:

```bash
npm install --save-dev webship-js @webship-js/diffy-steps
```

The pack has no dependency of its own: it uses the Node 20+ built-ins
(`fetch`, `FormData`, `Blob`, `fs`). It ships three files, `diffy.steps.js`
(the steps), `diffy-client.js` (the API client) and `diffy-images.js` (image
helpers); the `require` path in `cucumber.js` below loads them all.

### 1. Edit `cucumber.js` — load the Diffy step definitions

Add the plugin's step-definition path to `require:` and set the `diffy` block
inside `worldParameters` for project defaults.

```js
module.exports = {
  default: {
    timeout: 60000,
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/diffy-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: ['tests/features/**/*.feature'],
    format: [
      '@cucumber/pretty-formatter',
      'json:tests/reports/cucumber_report.json',
    ],
    formatOptions: {
      colorsEnabled: true,
      theme: {
        'feature keyword': ['bold', 'blue'],
        'feature name': ['blue', 'underline'],
        'feature description': ['blueBright'],
        'scenario keyword': ['bold', 'magenta'],
        'scenario name': ['magenta', 'underline'],
        'step keyword': ['bold', 'green'],
        'step text': ['greenBright', 'italic'],
      },
    },
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'http://localhost:8080',
      minWaitTime: {
        page: 3000,
        before_scenario: 0,
        after_scenario: 0,
        before_step: 0,
        after_step: 0,
      },
      // Diffy (optional). Env vars (DIFFY_API_KEY, DIFFY_PROJECT_ID, …)
      // always override these values. Never commit a real apiKey — prefer env.
      // diffy: {
      //   apiKey: '',                                  // DIFFY_API_KEY
      //   projectId: '',                               // DIFFY_PROJECT_ID
      //   breakpoints: '640,1200',                     // DIFFY_BREAKPOINTS
      //   windowHeight: 2000,                          // DIFFY_WINDOW_HEIGHT
      //   screenshotsDir: '',                          // DIFFY_SCREENSHOTS_DIR
      //   baseUrl: 'https://app.diffy.website/api/',   // DIFFY_API_BASE_URL
      //   maxWait: 1200,                               // DIFFY_MAX_WAIT (seconds)
      //   env1Url: '',                                 // DIFFY_ENV1_URL (custom env)
      //   env2Url: '',                                 // DIFFY_ENV2_URL (custom env)
      // },
    },
  },
};
```

### 2. Create a Diffy project and collect credentials

- Sign up or log in at https://app.diffy.website
- Create a project (set base URL + breakpoints that match your tests)
- Note the numeric **project id** shown in the project URL/settings
- Copy an **API key** from https://app.diffy.website/#/keys

### 3. Export Diffy env vars

Add to `.env`, CI secrets, or your shell:

```bash
export DIFFY_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export DIFFY_PROJECT_ID="00000"
export DIFFY_BREAKPOINTS="640,1200"         # must match project config
export DIFFY_WINDOW_HEIGHT="2000"           # optional
export DIFFY_MAX_WAIT="1200"                # optional, polling timeout (s)
```

Or inline per run:

```bash
DIFFY_API_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" DIFFY_PROJECT_ID="00000" DIFFY_API_BASE_URL="https://app.diffy.website/api/" npm test
```

**Do not commit keys.** Put them in `.env.local` (git-ignored), CI secrets
manager, or a vault. See the full variable table below for every supported
option.

### 4. Write or copy a Diffy feature file

Start from one of this repository's reference features:

```bash
cp node_modules/@webship-js/diffy-steps/tests/features/01-example-demo.feature \
   tests/features/my-visual-regression.feature
```

Edit it to list the pages you want compared. Keep the `@diffy` tag on each
scenario.

### 5. Run

```bash
# Run all features including Diffy scenarios.
npm test

# Run only Diffy-tagged scenarios.
npx cucumber-js --config cucumber.js --tags "@diffy"

# The same features against the real Diffy API (requires DIFFY_API_KEY and DIFFY_PROJECT_ID)
npm run test:live
```

### 6. CI hookup (optional)

Typical CI flow: run baseline on main → run candidate on PR branch →
`create diffy comparison with name "PR-<number>"` → fail job if the comparison
reports changes above your threshold. See the
[automation docs](https://docs.diffy.website/automation/overview) for worked
examples (GitHub Actions, CircleCI, Tugboat, Platform.sh).

### Remove Diffy later (reversible)

```bash
npm uninstall @webship-js/diffy-steps
# then remove the 'node_modules/@webship-js/diffy-steps/**' line from cucumber.js require:
# and delete your own @diffy feature files.
```

## Environment variables

| Variable                | Purpose                                                      | Default                              |
| ----------------------- | ------------------------------------------------------------ | ------------------------------------ |
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
| `Then upload folder "<path>" to diffy as "<name>"` | `POST projects/{id}/create-custom-snapshot` (functional test) |
| `Then wait for diffy comparison to complete` | `GET diffs/{id}` (polling) |

## Example

```gherkin
@diffy
Feature: Visual regression
  Scenario: Compare two pages across breakpoints
    Given I am on "/"
    Then I take screenshots for all breakpoints

    Given I am on "/about-us"
    Then I take screenshots for all breakpoints
    Then send screenshots to diffy with name "baseline"

    Given I am on "/"
    When I resize window to "1200"
    Then I take screenshot
    Then send screenshots to diffy with name "feature-branch"

    Then create diffy comparison with name "PR-42"
    Then wait for diffy comparison to complete
```

Run:

```bash
export DIFFY_API_KEY=your-key
export DIFFY_PROJECT_ID=30542
export DIFFY_BREAKPOINTS="640,1200"
npm test
```

## Reference feature files

Located in `tests/features/`. All scenarios tagged `@diffy`.

| File | Purpose | Extra tag |
|------|---------|-----------|
| `01-example-demo.feature` | Canonical example using bundled `/diffy/baseline.html` + `/diffy/changed.html` | `@example` |
| `02-all-steps.feature`    | Smoke test of every step definition      | `@smoke` + sub-tags |

The features run in two lanes: against a local mock of the Diffy API
(`npm test`) and against the real API (`npm run test:live`, which needs
`DIFFY_API_KEY` and `DIFFY_PROJECT_ID` and prints why it skipped without them).

Bundled example pages live in `examples/diffy/baseline.html` and
`examples/diffy/changed.html` (with a local index at
`examples/diffy/index.html`). The `changed` page shows deliberate visual
regressions (palette shift, new badge, added section, pricing change) so
Diffy has real differences to report.

---

## Diffy links

### Product
- Home — https://diffy.website
- Pricing — https://diffy.website/pricing
- Free-tier sign-up — https://app.diffy.website/#/register
- Sign-in — https://app.diffy.website
- API keys page — https://app.diffy.website/#/keys

### Documentation home
- Docs — https://docs.diffy.website
- Welcome / IP allow-list — https://docs.diffy.website/features/welcome
- Legacy docs (outdated, kept for reference) — https://diffy.website/documentation

### Features
- Playwright integration — https://docs.diffy.website/features/playwright-integration
- Figma comparison — https://docs.diffy.website/features/figma
- Mask and exclude regions — https://docs.diffy.website/features/mask-and-exclude
- JavaScript snippets — https://docs.diffy.website/features/javascript-snippets
- HTTP headers — https://docs.diffy.website/features/http-headers
- Cookies — https://docs.diffy.website/features/cookies
- CSS overrides — https://docs.diffy.website/features/css-overrides
- Mock content — https://docs.diffy.website/features/mock-content
- Tags — https://docs.diffy.website/features/tags
- Project-from-YAML — https://docs.diffy.website/features/configure-project-from-yaml-file
- Zapier / Jira / Trello / Basecamp — https://docs.diffy.website/features/zapier-integration-jira-trello-basecamp-integrations

### Dealing with dynamic elements
- Overview — https://docs.diffy.website/features/dealing-with-dynamic-elements
- Freeze carousels / sliders — https://docs.diffy.website/features/dealing-with-dynamic-elements/freeze-carousels-sliders
- Cookie-policy popups — https://docs.diffy.website/features/dealing-with-dynamic-elements/cookies-policy-popups
- Misc JavaScript snippets — https://docs.diffy.website/features/dealing-with-dynamic-elements/misc-javascript-snippets

### Bypass firewalls / protections
- Overview (Cloudfront / Akamai / Incapsula) — https://docs.diffy.website/features/bypass-protection-cloudfront-akamai-incapsula
- Akamai — https://docs.diffy.website/features/bypass-protection-cloudfront-akamai-incapsula/bypass-akamai-protection
- Imperva / Incapsula — https://docs.diffy.website/features/bypass-protection-cloudfront-akamai-incapsula/bypass-imperva-incapsula-protection

### Local development
- Overview — https://docs.diffy.website/features/local-development
- DDEV add-on — https://docs.diffy.website/features/local-development/ddev-add-on
- Lando integration — https://docs.diffy.website/features/local-development/lando-integration
- Docksal — https://docs.diffy.website/features/local-development/docksal
- Standalone Docker container — https://docs.diffy.website/features/local-development/standalone-docker-container
- ngrok — https://docs.diffy.website/features/local-development/ngrok

### CI / CD automation
- Automation overview — https://docs.diffy.website/automation/overview
- GitHub + Pantheon + CircleCI — https://docs.diffy.website/automation/github-pantheon-circleci
- GitHub + Pantheon + GitHub Actions — https://docs.diffy.website/automation/github-pantheon-github-actions
- GitHub + Tugboat — https://docs.diffy.website/automation/github-tugboat
- Platform.sh + GitHub Actions — https://docs.diffy.website/automation/platformsh-github-action

### Tutorials
- Comparison review — https://docs.diffy.website/tutorials/comparison-review

### Source code / packages
- diffy-cli (PHP, packaged as `diffy.phar`) — https://github.com/DiffyWebsite/diffy-cli
- diffy-cli releases — https://github.com/DiffyWebsite/diffy-cli/releases
- DiffyWebsite org — https://github.com/DiffyWebsite

### Diffy REST API reference (endpoints used by these steps)

Base URL: `https://app.diffy.website/api/` (override with `DIFFY_API_BASE_URL`).

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `auth/key` | Exchange API key for a short-lived bearer token |
| `POST` | `projects` | Create a project |
| `POST` | `projects/{id}` | Update a project |
| `GET`  | `projects/{id}` | Read project settings |
| `GET`  | `projects` | List projects |
| `POST` | `projects/{id}/screenshots` | Trigger server-side screenshot run |
| `GET`  | `projects/{id}/screenshots` | List snapshots |
| `POST` | `projects/{id}/create-custom-snapshot` | Upload custom PNGs (multipart) |
| `PUT`  | `projects/{id}/set-base-line-set/{screenshotId}` | Promote snapshot to baseline |
| `POST` | `projects/{id}/diffs` | Create a diff between two snapshot ids |
| `POST` | `projects/{id}/compare` | Server-side env-to-env compare |
| `GET`  | `projects/{id}/diffs?page=N` | List diffs |
| `GET`  | `diffs/{id}` | Diff status + result |
| `GET`  | `snapshots/{id}` | Snapshot detail |

All authenticated calls carry `Authorization: Bearer <token>`. The token comes
from `POST auth/key` with `{"key": "<DIFFY_API_KEY>"}` and is refreshed lazily
inside `diffy.steps.js`.

### Diffy-side IPs (allow-list in CDN / firewall)

From [Welcome](https://docs.diffy.website/features/welcome):

- IPv4: `138.201.56.149`
- IPv6: `2a01:4f8:172:1189::2`

### Support / contact
- Email — info@diffy.website
- Issue trackers: file bugs against the matching repo above (cli, behat, php, etc.)
