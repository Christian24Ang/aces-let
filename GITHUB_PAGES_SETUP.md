# ACES LET Web — GitHub Pages Setup

## 1. Register the Firebase Web app

In the same Firebase project used by ACES LET Android:

1. Open **Project settings → General**.
2. Under **Your apps**, choose **Add app → Web (`</>`)**.
3. Use the nickname `ACES LET Web`.
4. Register the app and copy the displayed `firebaseConfig` values.
5. Open `docs/firebase-config.js` and replace every placeholder with the exact Web configuration.

Do not place a Service-account JSON in this project. The Web Firebase configuration is client configuration; access remains controlled by Firebase Authentication and Firestore Security Rules.

## 2. Authorize the GitHub Pages domain

In Firebase Console:

1. Open **Authentication → Settings → Authorized domains**.
2. Add your GitHub Pages host, for example:

   `christianangangan.github.io`

Add only the host name—do not include `https://` or the repository path.

Keep `localhost` authorized for local testing.

## 3. Create the GitHub repository

1. Create a repository, for example `aces-let-web`.
2. Upload all files and folders from this package to the repository.
3. Confirm that the deployable website is inside the `docs` folder.
4. Never upload a Firebase Service-account JSON, private key, password list, or administrator credential.

## 4. Enable GitHub Pages

In the repository:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch `main`.
4. Select folder `/docs`.
5. Save.

The website will normally become available at:

`https://YOUR_USERNAME.github.io/YOUR_REPOSITORY/`

The included relative paths, PWA scope, and service worker are compatible with this repository subpath.

## 5. Local preview

Run `preview_windows.bat`, then open:

`http://localhost:8080`

Do not open `docs/index.html` directly because browser JavaScript modules require an HTTP server.

## 6. Firestore rules

Publish the included `firestore.rules`, or keep the identical Cloud Progress Sync rules already published for ACES LET Android v0.9.7.

The rules add private learner paths:

```text
users/{uid}
users/{uid}/attempts/{attemptId}
```

Each signed-in learner can access only their own Profile and History. Attempts are append-only and cannot be deleted by learner clients.

## Updating an existing GitHub Pages deployment

When replacing v0.1.1 files, preserve your already configured:

```text
docs/firebase-config.js
```

Then replace the remaining site files, commit, and push. The updated service worker uses a new cache name so the new shell is installed after deployment.

## Security and sync behavior

- No Service-account JSON is included.
- Firebase Authentication and Firestore Rules protect each learner's records by UID.
- Firestore question content uses memory-only web cache.
- The service worker caches the interface and icon assets, not Firebase question responses.
- `firebase-config.js` is explicitly excluded from the app-shell cache.
- Profile and History synchronize with ACES LET Android and other signed-in browsers.
- Statistics are recalculated locally from synchronized History.
