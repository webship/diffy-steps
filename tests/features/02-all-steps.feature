Feature: Diffy — all step definitions smoke test
  Exercise every Diffy step at least once against the example pages.
  The same scenarios run in two lanes: against a local mock of the Diffy API
  (npm test) and against the real API (npm run test:live). The scenarios
  tagged project-environments need a Diffy project whose production and
  staging URLs Diffy can reach; the live lane skips them unless
  DIFFY_LIVE_PROJECT_ENVIRONMENTS=1. The ones tagged remote-url need two
  addresses Diffy can reach, in DIFFY_ENV1_URL and DIFFY_ENV2_URL.

  @diffy @smoke @project-check
  Scenario: Check the key and the project id
    Given the visual comparison project is reachable
    Then the visual comparison project should be reachable

  @diffy @smoke
  Scenario: Resize, take screenshot, breakpoints loop, send
    Given I am on "/pages/baseline.html"
    When I resize window to "640"
    Then I take screenshot
    Given I am on "/pages/changed.html"
    Then I take screenshots for all breakpoints
    Then send the screenshots for visual comparison with name "smoke-set-1"

    Given I am on "/pages/baseline.html"
    Then I take screenshots for all breakpoints
    Then send the screenshots for visual comparison with name "smoke-set-2"

    Then create a visual comparison
    Then wait for the visual comparison to complete

  @diffy @smoke @named-compare
  Scenario: Named comparison variant
    Given I am on "/pages/baseline.html"
    Then I take screenshots for all breakpoints
    Then send the screenshots for visual comparison with name "smoke-named-a"

    Given I am on "/pages/changed.html"
    Then I take screenshots for all breakpoints
    Then send the screenshots for visual comparison with name "smoke-named-b"

    Then create a visual comparison with name "PR-smoke"
    Then wait for the visual comparison to complete

  @diffy @smoke @env-compare @project-environments
  Scenario: Server-side environment compare
    Then visually compare "prod" with "stage" with name "release-compare"
    Then wait for the visual comparison to complete

  @diffy @smoke @env-screenshot @project-environments
  Scenario: Trigger Diffy-side screenshot run per environment
    Then create a visual screenshot from the "production" environment
    Then create a visual screenshot from the "staging" environment
    Then create a visual comparison with name "env-pair"
    Then wait for the visual comparison to complete

  @diffy @smoke @baseline @project-environments @sets-baseline
  Scenario: Wait for screenshots, make them the baseline and compare against it
    Then create a visual screenshot from the "production" environment
    Then wait for the visual screenshots to complete
    Then set the last visual screenshots as the baseline
    Then visually compare "baseline" with "prod"
    Then wait for the visual comparison to complete
    Then the visual comparison should have at most "0" percent of pages changed

  @diffy @smoke @env-custom @remote-url
  Scenario: Custom environments, at the address of the variables and at an address in the step
    Then create a visual screenshot from the "custom" environment
    Then create a visual screenshot from the custom environment "https://www.example.org"
    Then create a visual comparison with name "custom-pair"
    Then wait for the visual comparison to complete

  @diffy @smoke @env-custom @remote-url
  Scenario: Compare two custom environments
    Then visually compare "custom" with "custom" with name "custom-vs-custom"
    Then wait for the visual comparison to complete

  @diffy @smoke @folder-upload
  Scenario: Upload PNG folders to Diffy
    Then upload the folder "./tests/fixtures/images/baseline" for visual comparison as "folder-baseline"
    Then upload the folder "./tests/fixtures/images/changed" for visual comparison as "folder-feature"
    Then create a visual comparison with name "folder-pair"
    Then wait for the visual comparison to complete
