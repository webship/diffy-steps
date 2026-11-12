# Diffy steps: deep reference

The pack is three files, loaded together by the `require` line shown in the [root README](../../README.md):

| File | Content |
| --- | --- |
| `diffy.steps.js` | The step definitions. |
| `diffy-client.js` | The Diffy API client: authentication, retries, errors, polling. It defines no step and does not load webship-js. |
| `diffy-images.js` | Image width, media type and folder helpers. |

This page is the adoption walkthrough and the contract notes. Installation, the variables and the steps are in the root README; each step has a generated page in [docs/steps](../../docs/README.md).

## Adopt the pack in a webship-js project

New to webship-js? Install and configure it first:

- [Install Webship JS](https://webship.co/docs/webship-js/2.0.x/install-webship-js)
- [Global settings (`cucumber.js`)](https://webship.co/docs/webship-js/2.0.x/global-settings)
- [Step definitions](https://webship.co/docs/webship-js/2.0.x/step-definitions)

Then:

1. **Install** the pack: `npm install --save-dev webship-js @webship-js/diffy-steps`.
2. **Load it** in `cucumber.js` (see the root README) and set `worldParameters.diffy.breakpoints` to widths your Diffy project has.
3. **Create a Diffy project** at https://app.diffy.website, and an **API key** at https://app.diffy.website/#/keys. API access needs an account with a paid plan or a coupon. The project id is the number in the project's URL.
4. **Export** the credentials in the shell or as CI secrets, never in a file that is committed:

   ```bash
   export DIFFY_API_KEY="..."
   export DIFFY_PROJECT_ID="..."
   ```

5. **Write a feature.** Start from `tests/features/01-example-demo.feature` of this repository, and begin with `Given the diffy project is reachable`: a wrong key or project id then fails before any capture, with a hint.
6. **Run** `npx cucumber-js --config cucumber.js --tags "@diffy"`.

To remove the pack later: `npm uninstall @webship-js/diffy-steps`, delete its line from the `require` list of `cucumber.js`, and delete your Diffy features.

### In CI

A typical flow: on the main branch, keep the project's baseline up to date; on a pull request, let Diffy compare the baseline with the pull request's environment and fail the job when the result is not what you expect. Export the environment's address as `DIFFY_ENV2_URL` (and `DIFFY_COMMIT_SHA` for a GitHub check).

```gherkin
Given the diffy project is reachable
Then compare diffy "baseline" with "custom" with name "PR-42"
And wait for diffy comparison to complete
And the diffy comparison should have at most "2" percent of pages changed
```

To test a site Diffy cannot reach, capture it with Playwright instead (`take screenshots for all breakpoints`, `send screenshots to diffy with name "PR-42"`) and use `create diffy comparison` against an earlier set.

Diffy's own examples for several CI and hosting set-ups are in its [automation documentation](https://docs.diffy.website/automation/overview). Name comparisons after the pull request or ticket, and reuse the baseline screenshots instead of capturing production on every run.

## Contract notes

The Swagger is at https://app.diffy.website/rest (the JSON is `https://app.diffy.website/rest/swagger.json`). It does not describe everything the pack needs; the rest comes from Diffy's open-source clients, [diffy-php](https://github.com/DiffyWebsite/diffy-php) and [diffy-cli](https://github.com/DiffyWebsite/diffy-cli).

| Topic | Source | What the pack does |
| --- | --- | --- |
| `POST auth/key`, body `{"key": ...}` | Swagger | Keeps the token of the answer (`token` property, as diffy-php reads it; a plain string is accepted too) for the run, renews it once on a 401. |
| Screenshot request | Swagger `CreateScreenshot` | Sends `environment` (`production`, `staging`, `development`, `custom`) and, for `custom`, `baseUrl`. The answer is the set id, a number. |
| Upload | Swagger `CreateCustomUploadedScreenshot` | Multipart `snapshotName`, `functionalTest`, `files[i]`, `urls[i]`, `breakpoints[i]`. Ten images per request, as the CLI does; the rest are appended. |
| Append images | Swagger `PUT snapshots/{id}`; the CLI uses `POST` | `PUT`, then `POST` when Diffy answers 404 or 405. |
| Comparison from two sets | Swagger `CreateDiff` | `snapshot1`, `snapshot2`, `name`. The answer is the diff id, a number. |
| Environment comparison | Swagger `CompareEnvironment`, `CompareCustomEnvironment` | `env1`, `env2` (`prod`, `stage`, `dev`, `baseline`, `custom`), `env1Url` and `env2Url` for custom, basic-auth fields `env1CredsMode`, `env1CredsUser`, `env1CredsPass` (and 2), `commitSha`, `name`. The answer is the diff id, documented as a string; strings are accepted. |
| Baseline | Swagger `PUT projects/{id}/set-base-line-set/{screenshot_id}` | As documented. |
| Screenshot states | diffy-php `Screenshot.php` | 0 not started, 1 in progress, 2 completed, 3 completed with the hook run, 4 zip file made. Complete in 2, 3 and 4. |
| Diff states | diffy-php `Diff.php` | 0 not started, 1 in progress, 2 completed, 3 hook run, 4 zip file made, 5 and 8 screenshots still in progress, 7 completed without a zip. Complete in 2, 3, 4 and 7. Any other state, for example -1 (stopped), is a failure. |
| Diff result | diffy-cli `diff:get-result` | `result` is the percentage of pages that changed; `diffs[url][breakpoint].percentageChanges` is per page and breakpoint; `diffSharedUrl` is the report. |
| Error body | diffy-php `Diffy::request` | `{"type": "validation_error", "errors": [...]}` and `{"code", "message"}` are shown in the message. A 403 with `"type": "api_access_disabled"` says the account has no API access. |
| Rate limits | not documented | A 429 is retried up to three times, waiting for `Retry-After` (at most 60 s). |

Not part of the API surface used here: notifications (chat, email, thresholds), masks, schedules and cookies are project settings, changed in Diffy or with `POST projects/{id}`.

### Allow Diffy through your firewall

When Diffy captures your site, its workers must be allowed through your CDN or firewall. From Diffy's [Welcome page](https://docs.diffy.website/features/welcome): IPv4 `138.201.56.149`, IPv6 `2a01:4f8:172:1189::2`. Check that the single-IP option is on in the project's settings (Advanced, Optimization). This does not apply to screenshots you capture with Playwright and send.

## Reference features

| File | Purpose |
| --- | --- |
| `01-example-demo.feature` | The canonical flow on the bundled pages: a changed page has changes, the same page twice has none, a comparison uses the last two sets. |
| `02-all-steps.feature` | Every step at least once, including the environment steps. |

The scenarios run in both lanes. Tags control what the live lane skips: `project-environments` (the project's production and staging URLs), `remote-url` (two reachable addresses), `sets-baseline` (replaces the project's baseline). The pages are in `examples/diffy/`; the `changed` page differs on purpose.

## Diffy links

- Product: https://diffy.website, pricing https://diffy.website/pricing, sign in https://app.diffy.website, API keys https://app.diffy.website/#/keys
- API reference (Swagger): https://app.diffy.website/rest
- Documentation: https://docs.diffy.website
- Features: [Playwright integration](https://docs.diffy.website/features/playwright-integration), [Mask and exclude](https://docs.diffy.website/features/mask-and-exclude), [JavaScript snippets](https://docs.diffy.website/features/javascript-snippets), [HTTP headers](https://docs.diffy.website/features/http-headers), [Cookies](https://docs.diffy.website/features/cookies), [CSS overrides](https://docs.diffy.website/features/css-overrides), [Mock content](https://docs.diffy.website/features/mock-content), [Dealing with dynamic elements](https://docs.diffy.website/features/dealing-with-dynamic-elements), [Tags](https://docs.diffy.website/features/tags), [Project from a YAML file](https://docs.diffy.website/features/configure-project-from-yaml-file)
- Firewalls and bot protection: [bypass protection](https://docs.diffy.website/features/bypass-protection-cloudfront-akamai-incapsula)
- Local development: [overview](https://docs.diffy.website/features/local-development), [ngrok](https://docs.diffy.website/features/local-development/ngrok)
- Automation: [overview](https://docs.diffy.website/automation/overview), [GitLab](https://docs.diffy.website/automation/gitlab)
- Tutorial: [Comparison review](https://docs.diffy.website/tutorials/comparison-review)
- Source: [diffy-cli](https://github.com/DiffyWebsite/diffy-cli), [diffy-php](https://github.com/DiffyWebsite/diffy-php)
