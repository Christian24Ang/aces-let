# ACES LET Web v0.1.1 — GitHub Pages Ready

A responsive Progressive Web App counterpart of ACES LET for learners who do not use Android.

## Included

- Same ACES LET icon and navy–royal–gold identity
- Firebase email/password sign-in and password reset
- Home folders and quizzes from the same Firestore project
- Game Mode and Exam Mode
- Local History, Statistics, and Profile per Firebase UID and browser
- Four destinations: Home, History, Stats, Profile
- Installable PWA shell
- Responsive phone, tablet, and desktop layout
- Memory-only Firestore cache
- GitHub Pages project-site support, including URLs such as `username.github.io/aces-let/`
- No Service-account JSON

## Important difference from Android

Quiz content requires an internet connection. The web app does not deliberately retain Firestore questions across browser sessions. History, Statistics, and Profile are stored only in the current browser.

## Quick start

1. Read `GITHUB_PAGES_SETUP.md`.
2. Register a Firebase Web app and paste its configuration into `docs/firebase-config.js`.
3. Upload this project to a GitHub repository.
4. Enable GitHub Pages from the `main` branch and `/docs` folder.

For local testing, run `preview_windows.bat`.
