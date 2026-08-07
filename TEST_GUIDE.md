# ACES LET Web v0.2.0 Test Guide

## Deployment

- [ ] Repository contains `docs/index.html`.
- [ ] GitHub Pages deploys from `main` and `/docs`.
- [ ] CSS, JavaScript, manifest, icons, and service worker load under the repository path.
- [ ] The GitHub Pages host is listed in Firebase Authentication authorized domains.
- [ ] The configured `docs/firebase-config.js` was preserved when updating the repository.

## Firebase and sign-in

- [ ] Existing ACES LET account signs in.
- [ ] Invalid credentials show a generic error.
- [ ] Forgot Password sends Firebase's standard reset email.
- [ ] Browser refresh preserves the signed-in session.

## Cloud Profile sync

- [ ] Save Full Name and University or School on Web.
- [ ] Profile shows `Up to date` after synchronization.
- [ ] The same Profile appears in ACES LET Android using the same account.
- [ ] Edit the Profile on Android and confirm Web receives the change.
- [ ] Save while temporarily offline; confirm it remains locally available and uploads after reconnecting.

## Cloud History and Stats

- [ ] Complete one Game Mode attempt on Web.
- [ ] Complete one Exam Mode attempt on Web.
- [ ] Both attempts appear in Web History and Stats.
- [ ] The attempts appear in ACES LET Android using the same account.
- [ ] Complete an attempt on Android and confirm it appears on Web.
- [ ] Refresh the browser and confirm cloud attempts remain visible.
- [ ] Confirm repeated sync does not create duplicate attempts.
- [ ] Confirm Stats recompute from all synchronized attempts.

## Existing browser-data migration

- [ ] Update over v0.1.1 without clearing browser storage.
- [ ] Existing local Profile remains visible.
- [ ] Existing local attempts remain visible.
- [ ] Valid legacy Profile and attempts upload once and then show as synchronized.

## Security

- [ ] A learner cannot read another UID's `users` document or attempts.
- [ ] Learners cannot delete cloud attempts.
- [ ] Learners cannot modify the score of an existing attempt.
- [ ] Only exact idempotent retries of an existing attempt are accepted.
- [ ] No Service-account JSON is present in the repository.

## Quiz behavior and PWA

- [ ] Only published folders and quizzes appear.
- [ ] Game and Exam buttons are unavailable while offline.
- [ ] Game Mode and Exam Mode retain their existing behavior.
- [ ] Install option works in a supported browser.
- [ ] Question responses are not cached by the service worker.
