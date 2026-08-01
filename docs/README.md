# @webship/diffy-steps documentation

Per-step reference for the `@webship/diffy-steps` plugin for [webship-js](https://www.npmjs.com/package/webship-js).

Start with the [root README](../README.md) for installation, configuration, and the environment-variable table. The [step-definitions README](../tests/step-definitions/README.md) carries the deep reference: the adoption walkthrough, the Diffy REST API endpoint map, the Diffy-side IP allow-list, and links into Diffy's own documentation.

## Available step definitions

| Step | Page |
| --- | --- |
| `When I resize window to "<px>"` | [when-i-resize-window-number](steps/when-i-resize-window-number.md) |
| `Then I take screenshot` | [then-i-take-screenshot](steps/then-i-take-screenshot.md) |
| `Then I take screenshots for all breakpoints` | [then-i-take-screenshots-all-breakpoints](steps/then-i-take-screenshots-all-breakpoints.md) |
| `Then send screenshots to diffy with name "<value>"` | [then-send-screenshots-diffy-name-value](steps/then-send-screenshots-diffy-name-value.md) |
| `Then create diffy comparison` | [then-create-diffy-comparison](steps/then-create-diffy-comparison.md) |
| `Then create diffy comparison with name "<value>"` | [then-create-diffy-comparison-name-value](steps/then-create-diffy-comparison-name-value.md) |
| `Then create diffy screenshot from "<environment>" environment` | [then-create-diffy-screenshot-environment-name](steps/then-create-diffy-screenshot-environment-name.md) |
| `Then compare diffy "<env1>" with "<env2>"` | [then-compare-diffy-env1-env2](steps/then-compare-diffy-env1-env2.md) |
| `Then upload folder "<path>" to diffy as "<snapshotName>"` | [then-upload-folder-url-diffy-snapshotname](steps/then-upload-folder-url-diffy-snapshotname.md) |
| `Then wait for diffy comparison to complete` | [then-wait-diffy-comparison-complete](steps/then-wait-diffy-comparison-complete.md) |

## Source layout

```
diffy-steps/
├── docs/                       <— You are here
│   └── steps/                  <— One page per step
├── examples/diffy/             <— baseline / changed example pages
└── tests/
    ├── features/               <— Runnable reference scenarios
    ├── step-definitions/
    │   └── diffy.steps.js      <— The shipped step-pack (the only published file)
    └── support/
        ├── diffy-mock.js       <— BeforeAll/AfterAll that boot the mock API
        └── mock-diffy-api/     <— Offline stand-in for app.diffy.website
```

Only `tests/step-definitions/diffy.steps.js` (plus `README.md` and `LICENSE`) is published to npm — everything else is this repository's own test project.
