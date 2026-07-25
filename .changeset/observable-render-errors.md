---
'@celestial/nebula': minor
'@celestial/test': minor
---

Make caught render errors observable instead of silent. The runtime still keeps an app running after an error thrown from update, view, subscriptions, or a lifecycle hook, but it now writes the message and stack to stderr when no `onRenderError` handler is supplied — previously the only trace was a single truncated terminal row that the next repaint erased. Opt out with the new `AppOptions.renderErrorReporting: 'silent'`.

`createTestApp` now forwards `onRenderError`, exposes `handle.renderErrors()` / `handle.clearRenderErrors()`, and by default fails the test when the runtime catches an error. Previously the harness supplied no handler at all, so every test silently tolerated a broken update or view and could only fail if an assertion happened to cover the affected text. Pass `renderErrors: 'collect'` for tests that drive a failure on purpose.

Add `PtyHarness.mark()` and `waitForText(match, { since })`. `waitForText` scans the whole accumulated transcript, so waiting on a string the program has already printed resolved immediately and synchronised nothing; marking first makes the wait mean "a new occurrence", which removes the need for unanchored sleeps in scenario tests.
