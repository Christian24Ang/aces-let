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

If the latest ACES LET learner/Admin Lite rules are already published, no additional database structure is required. The included `firestore.rules` is provided for comparison and backup.

## Security behavior

- No Service-account JSON is included.
- Firestore question content uses memory-only web cache.
- The service worker caches the website interface and icon assets, not Firebase question responses.
- `firebase-config.js` is explicitly excluded from the app-shell cache.
- History, Statistics, and Profile remain local to each Firebase UID and browser profile.
- Website progress does not synchronize with Android or another browser/device.
