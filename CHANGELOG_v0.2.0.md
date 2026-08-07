# ACES LET Web v0.2.0 — Cloud Progress Sync

## Added

- Profile synchronization with `users/{uid}` in Cloud Firestore.
- History synchronization with `users/{uid}/attempts/{attemptId}`.
- Shared data compatibility with ACES LET Android v0.9.7.
- Offline-first browser cache for Profile and History using IndexedDB.
- Pending-write retry when connectivity returns.
- Cloud Sync status and manual Retry action in Profile.
- Migration of existing browser-local Profile and attempts into the cloud.

## Changed

- History and Profile are no longer limited to one browser.
- Statistics are calculated from synchronized History and are not stored separately online.
- New attempts use the same append-only schema and unique attempt IDs as Android.
- Profile now requires both Full Name and University or School for cloud validation.
- History and Stats page wording now reflects cross-device data.
- PWA shell cache updated to v0.2.0.

## Preserved

- GitHub Pages `/docs` deployment structure.
- Existing Firebase Web configuration format.
- Game Mode and Exam Mode behavior.
- Memory-only Firestore question cache.
- Password reset, PWA install, and ACES visual identity.
