# ACES LET Web v0.2.0 — Cloud Progress Sync

A responsive GitHub Pages/PWA counterpart of ACES LET for learners who do not use Android.

## Included

- Same ACES LET icon and navy–royal–gold identity
- Firebase email/password sign-in and password reset
- Home folders and quizzes from the same Firestore project
- Game Mode and Exam Mode
- Cloud-synchronized Profile and History using the same Firebase UID as ACES LET Android
- Statistics recalculated from synchronized History; no separate Stats document is stored
- Browser-local IndexedDB cache for fast loading and pending-sync recovery
- Four destinations: Home, History, Stats, Profile
- Installable PWA shell
- Responsive phone, tablet, and desktop layout
- GitHub Pages repository-subpath support
- No Service-account JSON

## Cross-device behavior

Profile and completed attempts are stored under:

```text
users/{uid}
users/{uid}/attempts/{attemptId}
```

A learner using the same Firebase account can see the same Profile, History, and calculated Statistics on ACES LET Android and ACES LET Web.

Quiz questions still require internet and are not deliberately retained across browser sessions. The service worker caches only the website shell and icon assets.

## Updating an existing GitHub deployment

1. Keep your existing configured `docs/firebase-config.js`.
2. Replace the other files in your repository with this v0.2.0 package.
3. Confirm that the Cloud Progress Sync rules from ACES LET Android v0.9.7 are published.
4. Commit and push the changes.

## Quick start

1. Read `GITHUB_PAGES_SETUP.md`.
2. Register a Firebase Web app and paste its configuration into `docs/firebase-config.js` if this is a new deployment.
3. Upload the project to GitHub.
4. Enable GitHub Pages from the `main` branch and `/docs` folder.

For local testing, run `preview_windows.bat`.
