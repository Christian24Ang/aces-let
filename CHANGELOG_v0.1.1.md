# ACES LET Web v0.1.1

## GitHub Pages compatibility

- Converted all local site references from domain-root paths to repository-relative paths.
- Updated the PWA manifest to use relative `id`, `start_url`, `scope`, and icon paths.
- Updated service-worker registration and cache URLs for GitHub Pages project subpaths.
- Added `docs/.nojekyll` and organized the deployable site under `/docs`.
- Replaced Firebase Hosting deployment instructions with GitHub Pages instructions.
- Added Firebase Authentication authorized-domain guidance for `username.github.io`.
- Preserved Firebase Authentication, Firestore, Game Mode, Exam Mode, History, Stats, Profile, and password-reset behavior.
