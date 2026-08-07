# ACES LET Web v0.1.1 Test Guide

## GitHub Pages deployment

- [ ] Repository contains a `docs` folder with `index.html`.
- [ ] Pages is configured to deploy from `main` and `/docs`.
- [ ] The site opens at `https://USERNAME.github.io/REPOSITORY/`.
- [ ] CSS, JavaScript, manifest, icons, and service worker load under the repository subpath.
- [ ] `USERNAME.github.io` is listed in Firebase Authentication authorized domains.

## Firebase and sign-in

- [ ] Setup screen disappears after valid Web Firebase configuration is added.
- [ ] Existing ACES LET account signs in.
- [ ] Invalid credentials show a generic error.
- [ ] Forgot Password sends the standard Firebase reset email.
- [ ] Refreshing the browser preserves the signed-in session.

## Home and quiz modes

- [ ] Only published folders and quizzes appear.
- [ ] Game and Exam buttons are unavailable while offline.
- [ ] Game Mode reveals the answer and rationalization only after submission.
- [ ] Exam Mode preserves answers, flagging, navigator state, results, and review behavior.
- [ ] Completed attempts appear in History and Stats.

## Local learner data

- [ ] History is separated by Firebase UID.
- [ ] Statistics update after each completed attempt.
- [ ] Profile persists after refresh.
- [ ] Reset Password works from Profile.
- [ ] Sign Out returns to Sign-in.

## Browser and PWA

- [ ] Test current Chrome, Edge, Firefox, and Safari where available.
- [ ] Test phone and desktop widths.
- [ ] Install option appears in a supported browser.
- [ ] Installed PWA opens inside the repository scope.
- [ ] Question responses are not deliberately cached by the service worker.
