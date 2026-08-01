module.exports = {
  default: {
    timeout: 60000,
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js', // Webship-js core step definitions.
      'tests/step-definitions/**/*.js',                         // This plugin's Diffy steps.
      'tests/support/**/*.js',                                  // Mock Diffy API (local runs only).
    ],
    paths: ['tests/features/**/*.feature'],
    // The real-API scenarios need a live DIFFY_API_KEY, so they are excluded
    // by default. Run them with: npx cucumber-js --tags "@real-api".
    tags: 'not @real-api',
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
      // Diffy configuration. Resolution order is always
      //   process.env.DIFFY_* -> these values -> built-in defaults.
      // Never commit a real apiKey — set DIFFY_API_KEY in the environment.
      // baseUrl defaults to the bundled mock server so `npm test` runs offline;
      // point it at https://app.diffy.website/api/ for real comparisons.
      diffy: {
        apiKey: 'mock-key',                          // DIFFY_API_KEY
        projectId: 1,                                // DIFFY_PROJECT_ID
        breakpoints: '640,1200',                     // DIFFY_BREAKPOINTS
        windowHeight: 2000,                          // DIFFY_WINDOW_HEIGHT
        screenshotsDir: '',                          // DIFFY_SCREENSHOTS_DIR
        baseUrl: 'http://127.0.0.1:3099/',           // DIFFY_API_BASE_URL (mock server)
        maxWait: 30,                                 // DIFFY_MAX_WAIT (seconds)
        env1Url: '',                                 // DIFFY_ENV1_URL (custom env)
        env2Url: '',                                 // DIFFY_ENV2_URL (custom env)
      },
    },
  },
};
