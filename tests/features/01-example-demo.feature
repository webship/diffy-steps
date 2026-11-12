Feature: Diffy — example pages demo
  Drive the bundled /diffy/baseline.html and /diffy/changed.html example
  pages through the Diffy capture and comparison flow, and check what Diffy
  reports. It runs against the mock Diffy API (npm test) and against the real
  API (npm run test:live).

  Config resolution (per-scenario):
    1. process.env.DIFFY_*
    2. cucumber.js worldParameters.diffy.*
    3. built-in defaults

  Background:
    Given the diffy project is reachable

  @diffy @example
  Scenario: A changed page shows changes in the comparison
    Given I am on "/diffy/baseline.html"
    Then I take screenshots for all breakpoints
    Then send screenshots to diffy with name "example-baseline"

    Given I am on "/diffy/changed.html"
    Then I take screenshots for all breakpoints
    Then send screenshots to diffy with name "example-changed"

    Then create diffy comparison with name "example-demo"
    Then wait for diffy comparison to complete
    Then the diffy comparison should have changes
    And the diffy comparison should have at most "100" percent of pages changed

  @diffy @example
  Scenario: The same page twice shows no changes
    Given I am on "/diffy/baseline.html"
    Then I take screenshots for all breakpoints
    Then send screenshots to diffy with name "example-first"
    Then I take screenshots for all breakpoints
    Then send screenshots to diffy with name "example-second"

    Then create diffy comparison with name "example-same"
    Then the diffy comparison should not have changes
    And the diffy comparison should have at most "0" percent of pages changed

  @diffy @example
  Scenario: A comparison uses the last two screenshot sets
    Given I am on "/diffy/baseline.html"
    Then I take screenshots for all breakpoints
    Then send screenshots to diffy with name "example-oldest"

    Given I am on "/diffy/changed.html"
    Then I take screenshots for all breakpoints
    Then send screenshots to diffy with name "example-middle"
    Then I take screenshots for all breakpoints
    Then send screenshots to diffy with name "example-newest"

    Then create diffy comparison with name "example-last-two"
    Then the diffy comparison should not have changes
