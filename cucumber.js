module.exports = {
  default: {
    timeout: 60000,
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js', // Webship-js core step definitions.
      'tests/step-definitions/**/*.js',                         // This plugin's Diffy steps.
      'tests/support/**/*.js',                                  // Example site, mock Diffy API and lane hooks.
    ],
    paths: ['tests/features/**/*.feature'],
    // Two lanes run the same features. The mock lane (default) starts a local
    // mock of the Diffy API. The live lane (npm run test:live) sets
    // DIFFY_LANE=live and talks to the real API; scenarios that need the mock
    // are left out. See tests/support/diffy-mock.js.
    tags: process.env.DIFFY_LANE === 'live' ? '@diffy and not @mock-only' : '@diffy',
    format: [
      '@cucumber/pretty-formatter',
      'json:tests/reports/cucumber_report.json',
    ],
    formatOptions: {
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
      selectors: {
        css: {},
        xpath: {},
        filesPath: './tests/selectors/',
        files: [],
        offset: 60,
        breakpoints: {
          xs:   { width: 375,  height: 667  },
          sm:   { width: 576,  height: 800  },
          md:   { width: 768,  height: 1024 },
          lg:   { width: 992,  height: 768  },
          xl:   { width: 1200, height: 900, default: true },
          xxl:  { width: 1400, height: 900  },
          xxxl: { width: 1920, height: 1080 },
        },
      },
      screenshot: {
        dir: './screenshots',
        purge: false,
        onFailed: true,
        onEveryStep: false,
        alwaysFullscreen: false,
        failedPrefix: 'failed_',
        filenamePattern: '{datetime}.{feature_file}.feature_{step_line}.{ext}',
        filenamePatternFailed: '{failed_prefix}{datetime}.{feature_file}.feature_{step_line}.{ext}',
        infoTypes: '',
      },
      // Diffy defaults for this repository's own features. Resolution order
      // is always process.env.DIFFY_* -> these values -> built-in defaults.
      // Never put an API key here: export DIFFY_API_KEY. In the mock lane the
      // key, project id and API address come from the mock (see
      // tests/support/diffy-mock.js), not from here or from the shell.
      diffy: {
        breakpoints: '640,1200',                     // DIFFY_BREAKPOINTS
        windowHeight: 2000,                          // DIFFY_WINDOW_HEIGHT
      },
    },
  },
};
