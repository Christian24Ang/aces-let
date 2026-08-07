import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  collection,
  doc,
  getDocs,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const appRoot = document.querySelector("#app");
const modalRoot = document.querySelector("#modal-root");
const toastRoot = document.querySelector("#toast-root");

const state = {
  configured: isConfigured(firebaseConfig),
  firebaseApp: null,
  auth: null,
  db: null,
  user: null,
  authReady: false,
  folders: [],
  quizzes: [],
  catalogError: "",
  view: "home",
  selectedFolderId: null,
  loadingMessage: "",
  attempts: [],
  profile: { fullName: "", university: "" },
  profileDraft: { fullName: "", university: "" },
  expandedQuizId: null,
  game: null,
  exam: null,
  online: navigator.onLine,
  unsubFolders: null,
  unsubQuizzes: null,
  unsubProfile: null,
  unsubAttempts: null,
  cloud: {
    isInitialSync: false,
    isSyncing: false,
    profileReady: false,
    attemptsReady: false,
    profilePending: false,
    pendingAttemptCount: 0,
    lastSyncedAt: null,
    errorMessage: ""
  },
  installPrompt: null
};

const dbPromise = openLocalDatabase();

window.addEventListener("online", () => {
  state.online = true;
  retryCloudSync();
  render();
});
window.addEventListener("offline", () => {
  state.online = false;
  updatePendingSyncCounts();
  render();
});
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  if (state.view === "profile") render();
});
window.addEventListener("beforeunload", (event) => {
  if (state.view === "game" || state.view === "exam") {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("popstate", () => handleBrowserBack());

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

bootstrap();

async function bootstrap() {
  if (!state.configured) {
    state.authReady = true;
    render();
    return;
  }

  try {
    state.firebaseApp = initializeApp(firebaseConfig);
    state.auth = getAuth(state.firebaseApp);
    state.db = initializeFirestore(state.firebaseApp, { localCache: memoryLocalCache() });
    await setPersistence(state.auth, browserLocalPersistence);
    onAuthStateChanged(state.auth, async (user) => {
      state.user = user;
      state.authReady = true;
      if (user) {
        await loadLocalUserData(user.uid);
        startCatalogListeners();
        startCloudProgressSync();
        replaceRoute("home");
      } else {
        stopCatalogListeners();
        stopCloudProgressSync();
        state.folders = [];
        state.quizzes = [];
        state.attempts = [];
        state.profile = { fullName: "", university: "" };
        state.profileDraft = { ...state.profile };
        state.cloud = emptyCloudState();
        state.view = "signin";
        history.replaceState({ aces: true, view: "signin" }, "", "#signin");
      }
      render();
    });
  } catch (error) {
    state.authReady = true;
    state.configured = false;
    renderSetup(`Firebase could not be initialized: ${friendlyError(error)}`);
  }
}

function isConfigured(config) {
  return Boolean(config?.apiKey && config?.projectId && config?.appId && !String(config.apiKey).startsWith("PASTE_"));
}

function startCatalogListeners() {
  stopCatalogListeners();
  const folderQuery = query(collection(state.db, "folders"), where("published", "==", true));
  const quizQuery = query(collection(state.db, "quizzes"), where("published", "==", true));

  state.unsubFolders = onSnapshot(folderQuery, (snapshot) => {
    state.folders = snapshot.docs.map((document) => ({
      id: document.id,
      name: stringField(document.data().name),
      description: stringField(document.data().description),
      order: numberField(document.data().order, Number.MAX_SAFE_INTEGER)
    })).filter((folder) => folder.name).sort(sortByOrderThenName);
    state.catalogError = "";
    render();
  }, (error) => {
    state.catalogError = catalogErrorMessage(error);
    render();
  });

  state.unsubQuizzes = onSnapshot(quizQuery, (snapshot) => {
    state.quizzes = snapshot.docs.map((document) => {
      const data = document.data();
      return {
        id: document.id,
        folderId: stringField(data.folderId),
        title: stringField(data.title),
        questionCount: Math.max(0, numberField(data.questionCount, 0)),
        estimatedMinutes: Math.max(0, numberField(data.estimatedMinutes, 0)),
        version: Math.max(1, numberField(data.version, 1)),
        order: numberField(data.order, Number.MAX_SAFE_INTEGER)
      };
    }).filter((quiz) => quiz.folderId && quiz.title).sort(sortByOrderThenName);
    state.catalogError = "";
    render();
  }, (error) => {
    state.catalogError = catalogErrorMessage(error);
    render();
  });
}

function stopCatalogListeners() {
  if (state.unsubFolders) state.unsubFolders();
  if (state.unsubQuizzes) state.unsubQuizzes();
  state.unsubFolders = null;
  state.unsubQuizzes = null;
}

function sortByOrderThenName(a, b) {
  return a.order - b.order || (a.name || a.title || "").localeCompare(b.name || b.title || "");
}

function emptyCloudState() {
  return {
    isInitialSync: false,
    isSyncing: false,
    profileReady: false,
    attemptsReady: false,
    profilePending: false,
    pendingAttemptCount: 0,
    lastSyncedAt: null,
    errorMessage: ""
  };
}

async function loadLocalUserData(uid) {
  const [rawAttempts, rawProfile] = await Promise.all([getAttempts(uid), getProfile(uid)]);
  const attempts = rawAttempts.map((attempt) => normalizeAttempt(attempt, uid)).filter(Boolean);
  const profile = normalizeProfile(rawProfile, uid);

  await Promise.all(attempts.map((attempt) => saveAttempt(attempt, false)));
  if (profile) await saveProfile(profile, false);

  state.attempts = attempts.sort((a, b) => b.completedAtEpochMillis - a.completedAtEpochMillis);
  state.profile = profile || { fullName: "", university: "" };
  state.profileDraft = { fullName: state.profile.fullName || "", university: state.profile.university || "" };
  await updatePendingSyncCounts();
}

function startCloudProgressSync() {
  stopCloudProgressSync();
  if (!state.user || !state.db) return;

  const uid = state.user.uid;
  state.cloud = { ...emptyCloudState(), isInitialSync: true };
  const profileRef = doc(state.db, "users", uid);
  const attemptsRef = collection(state.db, "users", uid, "attempts");

  state.unsubProfile = onSnapshot(
    profileRef,
    { includeMetadataChanges: true },
    async (snapshot) => {
      state.cloud.profileReady = true;
      if (!snapshot.exists() || snapshot.metadata.hasPendingWrites()) {
        updateInitialCloudSyncState();
        return;
      }
      const remote = profileFromCloud(snapshot.data(), uid);
      if (remote) {
        const local = normalizeProfile(await getProfile(uid), uid);
        if (!local || local.cloudSyncState === "SYNCED" || remote.updatedAtEpochMillis >= local.updatedAtEpochMillis) {
          const hasUnsavedDraft = state.profileDraft.fullName !== (state.profile.fullName || "")
            || state.profileDraft.university !== (state.profile.university || "");
          await saveProfile(remote, false);
          state.profile = remote;
          if (!hasUnsavedDraft) {
            state.profileDraft = { fullName: remote.fullName, university: remote.university };
          }
          markCloudActivity();
          renderIfMainView();
        }
      }
      updateInitialCloudSyncState();
    },
    (error) => {
      state.cloud.profileReady = true;
      updateInitialCloudSyncState();
      reportCloudSyncError("Profile could not be downloaded.", error);
    }
  );

  state.unsubAttempts = onSnapshot(
    attemptsRef,
    { includeMetadataChanges: true },
    async (snapshot) => {
      state.cloud.attemptsReady = true;
      const remoteAttempts = snapshot.docs
        .filter((document) => !document.metadata.hasPendingWrites())
        .map((document) => attemptFromCloud(document.id, document.data(), uid))
        .filter(Boolean);
      if (remoteAttempts.length) {
        await Promise.all(remoteAttempts.map((attempt) => saveAttempt(attempt, false)));
        for (const attempt of remoteAttempts) upsertStateAttempt(attempt);
        markCloudActivity();
        await updatePendingSyncCounts();
        renderIfMainView();
      }
      updateInitialCloudSyncState();
    },
    (error) => {
      state.cloud.attemptsReady = true;
      updateInitialCloudSyncState();
      reportCloudSyncError("History could not be downloaded.", error);
    }
  );

  retryCloudSync();
}

function stopCloudProgressSync() {
  if (state.unsubProfile) state.unsubProfile();
  if (state.unsubAttempts) state.unsubAttempts();
  state.unsubProfile = null;
  state.unsubAttempts = null;
}

function updateInitialCloudSyncState() {
  if (state.cloud.profileReady && state.cloud.attemptsReady) {
    state.cloud.isInitialSync = false;
    retryCloudSync();
    renderIfMainView();
  }
}

async function retryCloudSync() {
  if (!state.user || !state.db || !state.online || state.cloud.isInitialSync || state.cloud.isSyncing) return;
  state.cloud.isSyncing = true;
  state.cloud.errorMessage = "";
  renderIfMainView();
  try {
    const uid = state.user.uid;
    const profile = normalizeProfile(await getProfile(uid), uid);
    if (profile && profile.cloudSyncState !== "SYNCED" && validProfileForCloud(profile)) {
      await uploadProfile(profile);
    }

    const attempts = (await getAttempts(uid)).map((attempt) => normalizeAttempt(attempt, uid)).filter(Boolean);
    for (const attempt of attempts.filter((item) => item.cloudSyncState !== "SYNCED")) {
      await uploadAttempt(attempt);
    }
    state.cloud.lastSyncedAt = Date.now();
  } catch (error) {
    reportCloudSyncError("Some changes are waiting to sync.", error);
  } finally {
    state.cloud.isSyncing = false;
    await updatePendingSyncCounts();
    renderIfMainView();
  }
}

async function uploadProfile(profile) {
  const uid = state.user.uid;
  await setDoc(doc(state.db, "users", uid), {
    fullName: profile.fullName,
    university: profile.university,
    updatedAtEpochMillis: profile.updatedAtEpochMillis,
    serverUpdatedAt: serverTimestamp(),
    schemaVersion: 1
  });
  const synced = { ...profile, cloudSyncState: "SYNCED", cloudSyncedAtEpochMillis: Date.now() };
  await saveProfile(synced, false);
  state.profile = synced;
}

async function uploadAttempt(attempt) {
  const cloudData = attemptToCloud(attempt);
  if (!cloudData) return;
  await setDoc(doc(state.db, "users", state.user.uid, "attempts", attempt.attemptId), cloudData);
  const synced = { ...attempt, cloudSyncState: "SYNCED", cloudSyncedAtEpochMillis: Date.now() };
  await saveAttempt(synced, false);
  upsertStateAttempt(synced);
}

function profileFromCloud(data, uid) {
  if (!data || typeof data.fullName !== "string" || typeof data.university !== "string") return null;
  const updatedAt = Number(data.updatedAtEpochMillis);
  const fullName = data.fullName.trim();
  const university = data.university.trim();
  if (fullName.length < 2 || university.length < 2 || !Number.isSafeInteger(updatedAt) || updatedAt <= 0) return null;
  return {
    ownerUid: uid,
    fullName,
    university,
    updatedAtEpochMillis: updatedAt,
    cloudSyncState: "SYNCED",
    cloudSyncedAtEpochMillis: Date.now()
  };
}

function attemptFromCloud(attemptId, data, uid) {
  if (!data || data.attemptId !== attemptId || data.ownerUid !== uid) return null;
  return normalizeAttempt({ id: attemptId, ...data, cloudSyncState: "SYNCED", cloudSyncedAtEpochMillis: Date.now() }, uid);
}

function normalizeProfile(profile, uid) {
  if (!profile) return null;
  const fullName = stringField(profile.fullName);
  const university = stringField(profile.university);
  const updatedAtEpochMillis = Math.trunc(numberField(profile.updatedAtEpochMillis ?? profile.updatedAt, Date.now()));
  if (!fullName && !university) return null;
  return {
    ownerUid: uid,
    fullName,
    university,
    updatedAtEpochMillis,
    cloudSyncState: profile.cloudSyncState === "SYNCED" ? "SYNCED" : "PENDING",
    cloudSyncedAtEpochMillis: Number.isFinite(Number(profile.cloudSyncedAtEpochMillis)) ? Number(profile.cloudSyncedAtEpochMillis) : null
  };
}

function normalizeAttempt(raw, uid) {
  if (!raw) return null;
  const attemptId = stringField(raw.attemptId || raw.id);
  const quizId = stringField(raw.quizId);
  const quizTitle = stringField(raw.quizTitle);
  const mode = raw.mode === "GAME" || raw.mode === "EXAM" ? raw.mode : null;
  const totalItems = Math.trunc(numberField(raw.totalItems, 0));
  const completedAtEpochMillis = Math.trunc(numberField(raw.completedAtEpochMillis ?? raw.completedAt, 0));
  if (!attemptId || !quizId || !quizTitle || !mode || totalItems <= 0 || completedAtEpochMillis <= 0) return null;
  const legacyUnanswered = Math.trunc(numberField(raw.unansweredCount ?? raw.unanswered, 0));
  const answeredCount = Math.max(0, Math.min(totalItems, Math.trunc(numberField(raw.answeredCount, totalItems - legacyUnanswered))));
  const score = Math.max(0, Math.min(answeredCount, Math.trunc(numberField(raw.score, 0))));
  const unansweredCount = totalItems - answeredCount;
  const startedAtEpochMillis = Math.max(1, Math.min(completedAtEpochMillis, Math.trunc(numberField(raw.startedAtEpochMillis, completedAtEpochMillis))));
  return {
    id: attemptId,
    attemptId,
    ownerUid: uid,
    quizId,
    quizTitle,
    mode,
    score,
    answeredCount,
    totalItems,
    incorrectCount: answeredCount - score,
    unansweredCount,
    startedAtEpochMillis,
    completedAtEpochMillis,
    quizVersion: Math.max(0, Math.trunc(numberField(raw.quizVersion, 0))),
    schemaVersion: 1,
    percentage: percent(score, totalItems),
    cloudSyncState: raw.cloudSyncState === "SYNCED" ? "SYNCED" : "PENDING",
    cloudSyncedAtEpochMillis: Number.isFinite(Number(raw.cloudSyncedAtEpochMillis)) ? Number(raw.cloudSyncedAtEpochMillis) : null
  };
}

function validProfileForCloud(profile) {
  return profile.fullName.length >= 2 && profile.fullName.length <= 100
    && profile.university.length >= 2 && profile.university.length <= 150
    && Number.isSafeInteger(profile.updatedAtEpochMillis) && profile.updatedAtEpochMillis > 0;
}

function attemptToCloud(attempt) {
  const normalized = normalizeAttempt(attempt, state.user.uid);
  if (!normalized) return null;
  return {
    attemptId: normalized.attemptId,
    ownerUid: normalized.ownerUid,
    quizId: normalized.quizId,
    quizTitle: normalized.quizTitle,
    mode: normalized.mode,
    score: normalized.score,
    answeredCount: normalized.answeredCount,
    totalItems: normalized.totalItems,
    incorrectCount: normalized.incorrectCount,
    unansweredCount: normalized.unansweredCount,
    startedAtEpochMillis: normalized.startedAtEpochMillis,
    completedAtEpochMillis: normalized.completedAtEpochMillis,
    quizVersion: normalized.quizVersion,
    schemaVersion: 1
  };
}

function upsertStateAttempt(attempt) {
  const index = state.attempts.findIndex((item) => item.attemptId === attempt.attemptId);
  if (index >= 0) state.attempts[index] = attempt;
  else state.attempts.push(attempt);
  state.attempts.sort((a, b) => b.completedAtEpochMillis - a.completedAtEpochMillis);
}

async function updatePendingSyncCounts() {
  if (!state.user) return;
  const uid = state.user.uid;
  const [attempts, profile] = await Promise.all([getAttempts(uid), getProfile(uid)]);
  state.cloud.pendingAttemptCount = attempts.map((item) => normalizeAttempt(item, uid)).filter((item) => item && item.cloudSyncState !== "SYNCED").length;
  const normalizedProfile = normalizeProfile(profile, uid);
  state.cloud.profilePending = Boolean(normalizedProfile && normalizedProfile.cloudSyncState !== "SYNCED");
}

function markCloudActivity() {
  state.cloud.lastSyncedAt = Date.now();
  state.cloud.errorMessage = "";
}

function reportCloudSyncError(message, error) {
  console.warn("ACES LET cloud sync:", error);
  state.cloud.isInitialSync = false;
  state.cloud.errorMessage = state.online ? message : "";
  renderIfMainView();
}

function renderIfMainView() {
  if (["home", "history", "stats", "profile"].includes(state.view)) render();
}

function render() {
  if (!state.authReady) {
    appRoot.innerHTML = `<div class="loading-overlay"><div><div class="spinner"></div><strong>Opening ACES LET…</strong></div></div>`;
    return;
  }
  if (!state.configured) return renderSetup();
  if (!state.user) return renderSignIn();

  if (state.view === "game") return renderGameMode();
  if (state.view === "gameResults") return renderGameResults();
  if (state.view === "exam") return renderExamMode();
  if (state.view === "examResults") return renderExamResults();
  if (state.view === "examReview") return renderExamReview();

  const titleMap = {
    home: state.selectedFolderId ? selectedFolder()?.name || "Quizzes" : "ACES LET",
    history: "History",
    stats: "Statistics",
    profile: "Profile"
  };
  const subtitleMap = {
    home: state.selectedFolderId ? `${folderQuizzes().length} quizzes and mock exams` : "Practice. Assess. Improve.",
    history: "Your completed attempts across devices",
    stats: "Performance calculated from your synced History",
    profile: "Your learner information and account"
  };

  appRoot.innerHTML = `
    <div class="shell">
      ${appHeader(titleMap[state.view], subtitleMap[state.view], Boolean(state.selectedFolderId), state.selectedFolderId ? "back-folder" : "")}
      <section class="page">
        ${!state.online ? `<div class="notice warning"><strong>Offline.</strong> Connect to the internet to open quizzes and refresh the quiz list. Your saved Profile and History remain available and will sync when you reconnect.</div>` : ""}
        ${state.catalogError && state.view === "home" ? `<div class="notice error">${escapeHtml(state.catalogError)}</div>` : ""}
        <div id="page-content"></div>
      </section>
      ${bottomNavigation()}
    </div>
    ${state.loadingMessage ? loadingOverlay(state.loadingMessage) : ""}
  `;

  const pageContent = document.querySelector("#page-content");
  if (state.view === "home") pageContent.innerHTML = state.selectedFolderId ? folderView() : homeView();
  if (state.view === "history") pageContent.innerHTML = historyView();
  if (state.view === "stats") pageContent.innerHTML = statsView();
  if (state.view === "profile") pageContent.innerHTML = profileView();
  wireMainViewEvents();
}

function renderSetup(extraMessage = "") {
  appRoot.innerHTML = `
    <section class="setup-page">
      <div class="setup-card">
        <img class="brand-logo" src="./assets/icon-192.png" alt="ACES LET icon" />
        <h1>ACES LET Web Setup</h1>
        <p class="tagline">One-time Firebase configuration required</p>
        <p class="auth-intro">Register a Web app in your ACES LET Firebase project, then paste its configuration into <code>docs/firebase-config.js</code>.</p>
        ${extraMessage ? `<div class="notice error">${escapeHtml(extraMessage)}</div>` : ""}
        <a class="primary-button full-button" style="display:grid;place-items:center;text-decoration:none" href="./setup.html">Open setup guide</a>
      </div>
    </section>`;
}

function renderSignIn() {
  appRoot.innerHTML = `
    <section class="signin-page">
      <form class="auth-card" id="signin-form">
        <img class="brand-logo" src="./assets/icon-192.png" alt="ACES LET icon" />
        <h1>ACES LET</h1>
        <p class="tagline">Practice. Assess. Improve.</p>
        <p class="auth-intro">Sign in to access your quizzes and mock exams.</p>
        <div class="field">
          <label for="signin-email">Email</label>
          <input id="signin-email" type="email" autocomplete="username" required />
        </div>
        <div class="field">
          <label for="signin-password">Password</label>
          <div class="password-wrap">
            <input id="signin-password" type="password" autocomplete="current-password" required />
            <button class="icon-text-button password-toggle" id="password-toggle" type="button">Show</button>
          </div>
        </div>
        <div class="forgot-row"><button class="icon-text-button" id="forgot-password" type="button">Forgot password?</button></div>
        <div class="error-text" id="signin-error"></div>
        <button class="primary-button full-button" id="signin-button" type="submit">Sign In</button>
        <p class="auth-note">Use the account provided to you.</p>
      </form>
    </section>`;

  document.querySelector("#password-toggle").addEventListener("click", () => {
    const input = document.querySelector("#signin-password");
    input.type = input.type === "password" ? "text" : "password";
    document.querySelector("#password-toggle").textContent = input.type === "password" ? "Show" : "Hide";
  });
  document.querySelector("#forgot-password").addEventListener("click", () => {
    openResetPasswordModal(document.querySelector("#signin-email").value.trim());
  });
  document.querySelector("#signin-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector("#signin-email").value.trim();
    const password = document.querySelector("#signin-password").value;
    const errorBox = document.querySelector("#signin-error");
    const button = document.querySelector("#signin-button");
    errorBox.textContent = "";
    button.disabled = true;
    button.textContent = "Signing in…";
    try {
      await signInWithEmailAndPassword(state.auth, email, password);
    } catch {
      errorBox.textContent = "Unable to sign in. Check your email and password, then try again.";
    } finally {
      button.disabled = false;
      button.textContent = "Sign In";
    }
  });
}

function appHeader(title, subtitle, showBack, backId = "") {
  return `<header class="app-header"><div class="header-inner">
    ${showBack ? `<button class="header-back" id="${backId}" aria-label="Back">←</button>` : `<img class="header-logo" src="./assets/icon-192.png" alt="" />`}
    <div class="header-copy"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div>
  </div></header>`;
}

function bottomNavigation() {
  const items = [
    ["home", "⌂", "Home"],
    ["history", "↺", "History"],
    ["stats", "▥", "Stats"],
    ["profile", "●", "Profile"]
  ];
  return `<nav class="bottom-nav" aria-label="Main navigation"><div class="bottom-nav-inner">
    ${items.map(([view, icon, label]) => `<button class="nav-button ${state.view === view ? "active" : ""}" data-nav="${view}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join("")}
  </div></nav>`;
}

function homeView() {
  if (!state.folders.length && !state.catalogError) return emptyState("▣", "No folders available", "Published quiz folders will appear here.");
  return `<div class="list">${state.folders.map((folder) => {
    const count = state.quizzes.filter((quiz) => quiz.folderId === folder.id).length;
    return `<button class="list-row" data-folder-id="${escapeAttr(folder.id)}">
      <span class="icon-tile">▣</span>
      <span class="row-copy"><span class="row-title">${escapeHtml(folder.name)}</span>${folder.description ? `<span class="row-subtitle">${escapeHtml(folder.description)}</span>` : ""}<span class="row-meta">${count} ${count === 1 ? "quiz or mock exam" : "quizzes and mock exams"}</span></span>
      <span class="chevron">›</span>
    </button>`;
  }).join("")}</div>`;
}

function folderView() {
  const quizzes = folderQuizzes();
  if (!quizzes.length) return emptyState("▤", "No quizzes available", "Published quizzes in this folder will appear here.");
  return `<div>${quizzes.map((quiz) => `<article class="quiz-row">
    <div class="quiz-main">
      <span class="icon-tile">✓</span>
      <div class="quiz-copy">
        <div class="quiz-title">${escapeHtml(quiz.title)}</div>
        <div class="quiz-meta">${quiz.questionCount} questions${quiz.estimatedMinutes ? ` • ${quiz.estimatedMinutes} min` : ""}</div>
      </div>
    </div>
    <div class="quiz-actions">
      <button class="compact-button game-button" data-start-game="${escapeAttr(quiz.id)}" ${!state.online ? "disabled" : ""}>▶ Game</button>
      <button class="compact-button exam-button" data-start-exam="${escapeAttr(quiz.id)}" ${!state.online ? "disabled" : ""}>▤ Exam</button>
    </div>
  </article>`).join("")}</div>`;
}

function historyView() {
  if (!state.attempts.length) return emptyState("↺", "No attempts yet", "Completed Game Mode and Exam Mode attempts will appear here.");
  return `<div class="list">${state.attempts.map((attempt) => `<div class="list-row">
    <span class="icon-tile">${attempt.mode === "GAME" ? "▶" : "▤"}</span>
    <span class="row-copy"><span class="row-title">${escapeHtml(attempt.quizTitle)}</span><span class="row-subtitle">${attempt.mode === "GAME" ? "Game Mode" : "Exam Mode"} • ${attempt.score}/${attempt.totalItems}</span><span class="row-meta">${formatDateTime(attempt.completedAtEpochMillis)}</span></span>
    <span class="history-score"><strong>${attempt.percentage}%</strong><span>${attempt.score}/${attempt.totalItems}</span></span>
  </div>`).join("")}</div>`;
}

function statsView() {
  if (!state.attempts.length) return emptyState("▥", "No statistics yet", "Complete a quiz or mock exam to begin tracking your performance.");
  const stats = computeStats(state.attempts);
  return `
    <div class="summary-hero"><div class="summary-label">Overall Accuracy</div><div class="summary-number">${stats.overall}%</div><div class="summary-caption">${stats.totalAttempts} attempts • ${stats.totalQuestions} questions answered</div></div>
    <div class="metric-grid">
      <div class="metric"><div class="metric-value">${stats.average}%</div><div class="metric-label">Average</div></div>
      <div class="metric"><div class="metric-value">${stats.best}%</div><div class="metric-label">Best</div></div>
      <div class="metric"><div class="metric-value">${stats.latest}%</div><div class="metric-label">Latest</div></div>
    </div>
    <h2 class="section-title" style="padding:18px 18px 0">Mode Performance</h2>
    ${modeStatsRow("Game Mode", stats.game, false)}
    ${modeStatsRow("Exam Mode", stats.exam, true)}
    <h2 class="section-title" style="padding:18px 18px 0">Recent Performance</h2>
    <div class="chart">${stats.recent.map((attempt, index) => `<div class="bar-wrap"><div class="bar ${index === stats.recent.length - 1 ? "latest" : ""}" style="height:${Math.max(3, attempt.percentage)}%"><span class="bar-label">${attempt.percentage}</span></div></div>`).join("")}</div>
    <h2 class="section-title" style="padding:18px 18px 0">Quiz Performance</h2>
    <div class="list">${stats.byQuiz.map((item) => `<button class="list-row" data-expand-quiz="${escapeAttr(item.quizId)}"><span class="icon-tile">▤</span><span class="row-copy"><span class="row-title">${escapeHtml(item.quizTitle)}</span><span class="row-subtitle">${item.attempts.length} attempts • Best ${item.best}%</span>${state.expandedQuizId === item.quizId ? `<span class="row-meta">Latest ${item.latest}% • Average ${item.average}% • Accuracy ${item.accuracy}%</span>` : ""}</span><span class="history-score"><strong>${item.average}%</strong><span>${state.expandedQuizId === item.quizId ? "⌃" : "⌄"}</span></span></button>`).join("")}</div>`;
}

function modeStatsRow(label, mode, gold) {
  return `<div class="mode-row"><div class="mode-top"><span>${label}</span><span>${mode.accuracy}%</span></div><div class="mode-sub">${mode.count} ${mode.count === 1 ? "attempt" : "attempts"}</div><div class="progress-track"><div class="progress-fill ${gold ? "gold" : ""}" style="width:${mode.accuracy}%"></div></div></div>`;
}

function profileView() {
  const initials = getInitials(state.profileDraft.fullName || state.user.email || "A");
  const sync = cloudSyncPresentation();
  return `
    <div class="profile-hero"><div class="avatar">${escapeHtml(initials)}</div><div><h2>${escapeHtml(state.profile.fullName || "ACES LET Learner")}</h2><p>${escapeHtml(state.profile.university || state.user.email || "")}</p></div></div>
    <form class="profile-form" id="profile-form">
      <div class="field"><label for="profile-name">Full Name</label><input id="profile-name" maxlength="100" value="${escapeAttr(state.profileDraft.fullName)}" /></div>
      <div class="field"><label for="profile-university">University or School</label><input id="profile-university" maxlength="150" value="${escapeAttr(state.profileDraft.university)}" /></div>
      <div class="error-text" id="profile-error"></div>
      <button class="primary-button full-button" type="submit">Save Changes</button>
    </form>
    <h2 class="section-title" style="padding:18px 18px 0">Account</h2>
    <div class="account-row"><span class="icon-tile">☁</span><span class="row-copy"><span class="row-title">Cloud Sync</span><span class="row-subtitle">${escapeHtml(sync.message)}</span></span>${sync.showRetry ? `<button class="secondary-button account-action" id="sync-retry">Retry</button>` : ""}</div>
    <div class="account-row"><span class="icon-tile">@</span><span class="row-copy"><span class="row-title">Signed-in email</span><span class="row-subtitle">${escapeHtml(state.user.email || "")}</span></span></div>
    <div class="account-row"><span class="icon-tile">↗</span><span class="row-copy"><span class="row-title">Reset Password</span><span class="row-subtitle">Send a password-reset link to your email.</span></span><button class="secondary-button account-action" id="profile-reset">Send Link</button></div>
    ${state.installPrompt ? `<div class="account-row"><span class="icon-tile">⇩</span><span class="row-copy"><span class="row-title">Install ACES LET</span><span class="row-subtitle">Add the web app to this device.</span></span><button class="secondary-button account-action" id="install-app">Install</button></div>` : ""}
    <div class="account-row"><span class="icon-tile">⇥</span><span class="row-copy"><span class="row-title">Sign Out</span><span class="row-subtitle">Your Profile and History are linked to this account.</span></span><button class="danger-button account-action" id="signout-button">Sign Out</button></div>`;
}

function cloudSyncPresentation() {
  if (state.cloud.isInitialSync) return { message: "Checking your Profile and History…", showRetry: false };
  if (!state.online && (state.cloud.profilePending || state.cloud.pendingAttemptCount > 0)) {
    return { message: "Waiting to sync when you are online.", showRetry: false };
  }
  if (state.cloud.isSyncing) return { message: "Syncing your Profile and History…", showRetry: false };
  if (state.cloud.errorMessage) return { message: state.cloud.errorMessage, showRetry: state.online };
  if (state.cloud.profilePending && !validProfileForCloud(state.profile)) {
    return { message: "Complete your Full Name and University or School to enable Profile sync.", showRetry: false };
  }
  if (state.cloud.profilePending || state.cloud.pendingAttemptCount > 0) {
    return { message: "Some changes are waiting to sync.", showRetry: state.online };
  }
  if (state.cloud.lastSyncedAt) return { message: `Up to date • ${formatDateTime(state.cloud.lastSyncedAt)}`, showRetry: false };
  return { message: "Your Profile and History sync across devices.", showRetry: false };
}

function wireMainViewEvents() {
  document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => navigateMain(button.dataset.nav)));
  document.querySelector("#back-folder")?.addEventListener("click", () => { state.selectedFolderId = null; replaceRoute("home"); render(); });
  document.querySelectorAll("[data-folder-id]").forEach((button) => button.addEventListener("click", () => {
    state.selectedFolderId = button.dataset.folderId;
    pushRoute("home");
    render();
  }));
  document.querySelectorAll("[data-start-game]").forEach((button) => button.addEventListener("click", () => startMode(button.dataset.startGame, "GAME")));
  document.querySelectorAll("[data-start-exam]").forEach((button) => button.addEventListener("click", () => startMode(button.dataset.startExam, "EXAM")));
  document.querySelectorAll("[data-expand-quiz]").forEach((button) => button.addEventListener("click", () => {
    state.expandedQuizId = state.expandedQuizId === button.dataset.expandQuiz ? null : button.dataset.expandQuiz;
    render();
  }));

  if (state.view === "profile") {
    const nameInput = document.querySelector("#profile-name");
    const universityInput = document.querySelector("#profile-university");
    nameInput?.addEventListener("input", () => { state.profileDraft.fullName = nameInput.value; });
    universityInput?.addEventListener("input", () => { state.profileDraft.university = universityInput.value; });
    document.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const fullName = state.profileDraft.fullName.trim().replace(/\s+/g, " ");
      const university = state.profileDraft.university.trim().replace(/\s+/g, " ");
      if (fullName.length < 2) {
        document.querySelector("#profile-error").textContent = "Enter your full name.";
        return;
      }
      if (university.length < 2) {
        document.querySelector("#profile-error").textContent = "Enter your university or school.";
        return;
      }
      const updatedAtEpochMillis = Date.now();
      state.profile = {
        ownerUid: state.user.uid,
        fullName,
        university,
        updatedAtEpochMillis,
        cloudSyncState: "PENDING",
        cloudSyncedAtEpochMillis: null
      };
      state.profileDraft = { fullName, university };
      await saveProfile(state.profile);
      await updatePendingSyncCounts();
      toast(state.online ? "Profile saved and syncing." : "Profile saved. It will sync when you reconnect.");
      render();
    });
    document.querySelector("#sync-retry")?.addEventListener("click", retryCloudSync);
    document.querySelector("#profile-reset")?.addEventListener("click", () => openResetPasswordModal(state.user.email || "", true));
    document.querySelector("#signout-button")?.addEventListener("click", () => openConfirmModal("Sign Out?", "You can sign in again using your ACES LET account.", "Sign Out", async () => signOut(state.auth)));
    document.querySelector("#install-app")?.addEventListener("click", async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt = null;
      render();
    });
  }
}

function navigateMain(view) {
  if (view === "home") state.selectedFolderId = null;
  state.view = view;
  pushRoute(view);
  render();
}

async function startMode(quizId, mode) {
  const quiz = state.quizzes.find((item) => item.id === quizId);
  if (!quiz || !state.online) return;
  state.loadingMessage = "Loading quiz…";
  render();
  try {
    const questions = await fetchQuestions(quiz);
    if (mode === "GAME") {
      state.game = { quiz, questions, index: 0, selected: null, submitted: false, answers: [], saved: false, startedAtEpochMillis: Date.now() };
      state.view = "game";
    } else {
      state.exam = { quiz, questions, index: 0, answers: {}, flags: new Set(), saved: false, reviewIndex: 0, startedAtEpochMillis: Date.now() };
      state.view = "exam";
    }
    state.loadingMessage = "";
    pushRoute(state.view);
    render();
  } catch (error) {
    state.loadingMessage = "";
    toast(questionErrorMessage(error));
    render();
  }
}

async function fetchQuestions(quiz) {
  const snapshot = await getDocs(collection(state.db, "quizzes", quiz.id, "questions"));
  if (snapshot.empty) throw new Error("NO_QUESTIONS");
  const questions = snapshot.docs.map((document) => parseQuestion(document.id, document.data())).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  if (questions.length !== quiz.questionCount) throw new Error("COUNT_MISMATCH");
  const orders = new Set();
  for (const question of questions) {
    if (orders.has(question.order)) throw new Error("DUPLICATE_ORDER");
    orders.add(question.order);
  }
  return questions;
}

function parseQuestion(id, data) {
  const required = (field) => {
    if (typeof data[field] !== "string" || !data[field].trim()) throw new Error("INVALID_QUESTION");
    return data[field].trim();
  };
  const order = Number(data.order);
  if (!Number.isInteger(order) || order < 1) throw new Error("INVALID_QUESTION");
  const correctAnswer = required("correctAnswer").toUpperCase();
  if (!["A", "B", "C", "D"].includes(correctAnswer)) throw new Error("INVALID_QUESTION");
  return {
    id,
    order,
    questionText: required("questionText"),
    choiceA: required("choiceA"),
    choiceB: required("choiceB"),
    choiceC: required("choiceC"),
    choiceD: required("choiceD"),
    correctAnswer,
    rationalization: typeof data.rationalization === "string" ? data.rationalization.trim() : "",
    topic: typeof data.topic === "string" ? data.topic.trim() : ""
  };
}

function renderGameMode() {
  const game = state.game;
  if (!game) return returnToFolder();
  const question = game.questions[game.index];
  const choices = choiceEntries(question);
  appRoot.innerHTML = `<div class="mode-page">
    ${appHeader(game.quiz.title, `Game Mode • Question ${game.index + 1} of ${game.questions.length}`, true, "mode-back")}
    <main class="mode-content">
      <div class="progress-strip"><span>Score: ${game.answers.filter((a) => a.isCorrect).length}</span><span>${Math.round(((game.index + (game.submitted ? 1 : 0)) / game.questions.length) * 100)}%</span></div>
      <section class="question-block"><div class="question-number">Question ${game.index + 1}</div><p class="question-text">${escapeHtml(question.questionText)}</p></section>
      <div class="choices">${choices.map(([letter, text]) => gameChoiceHtml(letter, text, question)).join("")}</div>
      ${game.submitted ? `<section class="feedback"><h3>${game.selected === question.correctAnswer ? "Correct" : `Correct Answer: ${question.correctAnswer}`}</h3><p>${escapeHtml(question.rationalization || "No rationalization provided.")}</p></section>` : ""}
      <div class="mode-actions">${game.submitted ? `<button class="primary-button" id="game-next">${game.index === game.questions.length - 1 ? "View Results" : "Next"}</button>` : `<button class="primary-button" id="game-submit" ${!game.selected ? "disabled" : ""}>Submit Answer</button>`}</div>
    </main>
  </div>`;
  document.querySelector("#mode-back").addEventListener("click", () => confirmExitActiveMode("Game Mode"));
  document.querySelectorAll("[data-game-choice]").forEach((button) => button.addEventListener("click", () => {
    if (game.submitted) return;
    game.selected = button.dataset.gameChoice;
    renderGameMode();
  }));
  document.querySelector("#game-submit")?.addEventListener("click", () => {
    if (!game.selected) return;
    game.submitted = true;
    game.answers.push({ questionId: question.id, selected: game.selected, isCorrect: game.selected === question.correctAnswer });
    renderGameMode();
  });
  document.querySelector("#game-next")?.addEventListener("click", async () => {
    if (game.index === game.questions.length - 1) {
      await saveCompletedGame();
      state.view = "gameResults";
      replaceRoute("gameResults");
      render();
    } else {
      game.index += 1;
      game.selected = null;
      game.submitted = false;
      renderGameMode();
    }
  });
}

function gameChoiceHtml(letter, text, question) {
  const game = state.game;
  const classes = ["choice"];
  if (game.selected === letter) classes.push("selected");
  if (game.submitted && letter === question.correctAnswer) classes.push("correct");
  if (game.submitted && game.selected === letter && letter !== question.correctAnswer) classes.push("incorrect");
  return `<button class="${classes.join(" ")}" data-game-choice="${letter}" ${game.submitted ? "disabled" : ""}><span class="choice-letter">${letter}</span><span class="choice-text">${escapeHtml(text)}</span></button>`;
}

async function saveCompletedGame() {
  const game = state.game;
  if (!game || game.saved) return;
  const score = game.answers.filter((answer) => answer.isCorrect).length;
  const attempt = buildAttempt(game.quiz, "GAME", score, game.questions.length, 0, game.startedAtEpochMillis);
  await saveAttempt(attempt);
  upsertStateAttempt(attempt);
  game.saved = true;
}

function renderGameResults() {
  const game = state.game;
  if (!game) return returnToFolder();
  const score = game.answers.filter((answer) => answer.isCorrect).length;
  const percentage = percent(score, game.questions.length);
  appRoot.innerHTML = `<div class="mode-page">${appHeader(game.quiz.title, "Game Mode Results", true, "results-back")}<main class="mode-content"><section class="result-hero"><h2>Game Complete</h2><div class="result-score">${score}/${game.questions.length}</div><div class="result-percent">${percentage}%</div></section><div class="metric-grid"><div class="metric"><div class="metric-value">${score}</div><div class="metric-label">Correct</div></div><div class="metric"><div class="metric-value">${game.questions.length - score}</div><div class="metric-label">Incorrect</div></div><div class="metric"><div class="metric-value">${game.questions.length}</div><div class="metric-label">Questions</div></div></div><div class="result-actions"><button class="gold-button" id="game-again">Play Again</button><button class="secondary-button" id="game-done">Done</button></div></main></div>`;
  document.querySelector("#results-back").addEventListener("click", returnToFolder);
  document.querySelector("#game-done").addEventListener("click", returnToFolder);
  document.querySelector("#game-again").addEventListener("click", () => {
    state.game = { quiz: game.quiz, questions: game.questions, index: 0, selected: null, submitted: false, answers: [], saved: false, startedAtEpochMillis: Date.now() };
    state.view = "game";
    replaceRoute("game");
    render();
  });
}

function renderExamMode() {
  const exam = state.exam;
  if (!exam) return returnToFolder();
  const question = exam.questions[exam.index];
  const selected = exam.answers[question.id] || null;
  appRoot.innerHTML = `<div class="mode-page">
    ${appHeader(exam.quiz.title, `Exam Mode • Question ${exam.index + 1} of ${exam.questions.length}`, true, "mode-back")}
    <main class="mode-content">
      <div class="progress-strip"><button class="icon-text-button" id="exam-navigator">Question Navigator</button><button class="icon-text-button" id="exam-flag">${exam.flags.has(question.id) ? "⚑ Unflag" : "⚐ Flag"}</button></div>
      <section class="question-block"><div class="question-number">Question ${exam.index + 1}</div><p class="question-text">${escapeHtml(question.questionText)}</p></section>
      <div class="choices">${choiceEntries(question).map(([letter, text]) => `<button class="choice ${selected === letter ? "selected" : ""}" data-exam-choice="${letter}"><span class="choice-letter">${letter}</span><span class="choice-text">${escapeHtml(text)}</span></button>`).join("")}</div>
      <div class="mode-actions"><button class="secondary-button" id="exam-prev" ${exam.index === 0 ? "disabled" : ""}>Previous</button>${exam.index === exam.questions.length - 1 ? `<button class="primary-button" id="exam-submit">Review & Submit</button>` : `<button class="primary-button" id="exam-next">Next</button>`}</div>
    </main>
  </div>`;
  document.querySelector("#mode-back").addEventListener("click", () => confirmExitActiveMode("Exam Mode"));
  document.querySelectorAll("[data-exam-choice]").forEach((button) => button.addEventListener("click", () => {
    exam.answers[question.id] = button.dataset.examChoice;
    renderExamMode();
  }));
  document.querySelector("#exam-flag").addEventListener("click", () => {
    exam.flags.has(question.id) ? exam.flags.delete(question.id) : exam.flags.add(question.id);
    renderExamMode();
  });
  document.querySelector("#exam-prev")?.addEventListener("click", () => { exam.index -= 1; renderExamMode(); });
  document.querySelector("#exam-next")?.addEventListener("click", () => { exam.index += 1; renderExamMode(); });
  document.querySelector("#exam-navigator").addEventListener("click", openExamNavigator);
  document.querySelector("#exam-submit")?.addEventListener("click", openSubmitExamModal);
}

function openExamNavigator() {
  const exam = state.exam;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-header"><h2>Question Navigator</h2></div><div class="modal-body"><div class="navigator-grid">${exam.questions.map((question, index) => `<button class="navigator-button ${exam.answers[question.id] ? "answered" : ""} ${exam.index === index ? "current" : ""} ${exam.flags.has(question.id) ? "flagged" : ""}" data-go-question="${index}">${index + 1}</button>`).join("")}</div></div><div class="modal-actions"><button class="secondary-button" id="modal-close">Close</button></div></section></div>`;
  document.querySelector("#modal-close").addEventListener("click", closeModal);
  document.querySelectorAll("[data-go-question]").forEach((button) => button.addEventListener("click", () => {
    exam.index = Number(button.dataset.goQuestion);
    closeModal();
    renderExamMode();
  }));
}

function openSubmitExamModal() {
  const exam = state.exam;
  const answered = Object.keys(exam.answers).length;
  const unanswered = exam.questions.length - answered;
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-header"><h2>Submit Exam?</h2></div><div class="modal-body"><p>Answered: <strong>${answered}</strong><br>Unanswered: <strong>${unanswered}</strong><br>Flagged: <strong>${exam.flags.size}</strong></p><p>Answers cannot be changed after submission.</p></div><div class="modal-actions"><button class="secondary-button" id="modal-close">Continue Exam</button><button class="primary-button" id="confirm-submit-exam">Submit Exam</button></div></section></div>`;
  document.querySelector("#modal-close").addEventListener("click", closeModal);
  document.querySelector("#confirm-submit-exam").addEventListener("click", async () => {
    closeModal();
    await completeExam();
  });
}

async function completeExam() {
  const exam = state.exam;
  if (!exam) return;
  const score = exam.questions.filter((question) => exam.answers[question.id] === question.correctAnswer).length;
  const unanswered = exam.questions.filter((question) => !exam.answers[question.id]).length;
  if (!exam.saved) {
    const attempt = buildAttempt(exam.quiz, "EXAM", score, exam.questions.length, unanswered, exam.startedAtEpochMillis);
    await saveAttempt(attempt);
    upsertStateAttempt(attempt);
    exam.saved = true;
  }
  state.view = "examResults";
  replaceRoute("examResults");
  render();
}

function renderExamResults() {
  const exam = state.exam;
  if (!exam) return returnToFolder();
  const score = exam.questions.filter((question) => exam.answers[question.id] === question.correctAnswer).length;
  const unanswered = exam.questions.filter((question) => !exam.answers[question.id]).length;
  const incorrect = exam.questions.length - score - unanswered;
  appRoot.innerHTML = `<div class="mode-page">${appHeader(exam.quiz.title, "Exam Mode Results", true, "results-back")}<main class="mode-content"><section class="result-hero"><h2>Exam Submitted</h2><div class="result-score">${score}/${exam.questions.length}</div><div class="result-percent">${percent(score, exam.questions.length)}%</div></section><div class="metric-grid"><div class="metric"><div class="metric-value">${score}</div><div class="metric-label">Correct</div></div><div class="metric"><div class="metric-value">${incorrect}</div><div class="metric-label">Incorrect</div></div><div class="metric"><div class="metric-value">${unanswered}</div><div class="metric-label">Unanswered</div></div></div><div class="result-actions"><button class="gold-button" id="review-answers">Review Answers</button><button class="secondary-button" id="exam-retake">Retake Exam</button><button class="secondary-button" id="exam-done">Done</button></div></main></div>`;
  document.querySelector("#results-back").addEventListener("click", returnToFolder);
  document.querySelector("#exam-done").addEventListener("click", returnToFolder);
  document.querySelector("#review-answers").addEventListener("click", () => { exam.reviewIndex = 0; state.view = "examReview"; pushRoute("examReview"); render(); });
  document.querySelector("#exam-retake").addEventListener("click", () => {
    state.exam = { quiz: exam.quiz, questions: exam.questions, index: 0, answers: {}, flags: new Set(), saved: false, reviewIndex: 0, startedAtEpochMillis: Date.now() };
    state.view = "exam";
    replaceRoute("exam");
    render();
  });
}

function renderExamReview() {
  const exam = state.exam;
  if (!exam) return returnToFolder();
  const question = exam.questions[exam.reviewIndex];
  const selected = exam.answers[question.id] || null;
  appRoot.innerHTML = `<div class="mode-page">${appHeader(exam.quiz.title, `Answer Review • ${exam.reviewIndex + 1} of ${exam.questions.length}`, true, "review-back")}<main class="mode-content"><section class="question-block"><div class="question-number">Question ${exam.reviewIndex + 1}</div><p class="question-text">${escapeHtml(question.questionText)}</p></section><div class="choices">${choiceEntries(question).map(([letter, text]) => {
    const classes = ["choice"];
    if (letter === question.correctAnswer) classes.push("correct");
    if (selected === letter && letter !== question.correctAnswer) classes.push("incorrect");
    return `<div class="${classes.join(" ")}"><span class="choice-letter">${letter}</span><span class="choice-text">${escapeHtml(text)}</span></div>`;
  }).join("")}</div><section class="feedback"><h3>${selected ? `Your answer: ${selected} • Correct answer: ${question.correctAnswer}` : `Unanswered • Correct answer: ${question.correctAnswer}`}</h3><p>${escapeHtml(question.rationalization || "No rationalization provided.")}</p></section><div class="mode-actions"><button class="secondary-button" id="review-prev" ${exam.reviewIndex === 0 ? "disabled" : ""}>Previous</button><button class="primary-button" id="review-next">${exam.reviewIndex === exam.questions.length - 1 ? "Back to Results" : "Next"}</button></div></main></div>`;
  document.querySelector("#review-back").addEventListener("click", () => { state.view = "examResults"; replaceRoute("examResults"); render(); });
  document.querySelector("#review-prev")?.addEventListener("click", () => { exam.reviewIndex -= 1; renderExamReview(); });
  document.querySelector("#review-next").addEventListener("click", () => {
    if (exam.reviewIndex === exam.questions.length - 1) {
      state.view = "examResults";
      replaceRoute("examResults");
      render();
    } else {
      exam.reviewIndex += 1;
      renderExamReview();
    }
  });
}

function confirmExitActiveMode(modeName) {
  openConfirmModal(`Exit ${modeName}?`, `Your unfinished ${modeName.toLowerCase()} attempt will be discarded and will not appear in History.`, `Exit ${modeName}`, returnToFolder);
}

function returnToFolder() {
  state.view = "home";
  state.game = null;
  state.exam = null;
  replaceRoute("home");
  render();
}

function handleBrowserBack() {
  if (modalRoot.innerHTML) {
    closeModal();
    history.pushState({ aces: true, view: state.view }, "", `#${state.view}`);
    return;
  }
  if (state.view === "game" || state.view === "exam") {
    history.pushState({ aces: true, view: state.view }, "", `#${state.view}`);
    confirmExitActiveMode(state.view === "game" ? "Game Mode" : "Exam Mode");
    return;
  }
  if (state.view === "examReview") {
    state.view = "examResults";
    render();
    return;
  }
  if (state.view === "gameResults" || state.view === "examResults") {
    returnToFolder();
    return;
  }
  if (state.selectedFolderId) {
    state.selectedFolderId = null;
    state.view = "home";
    render();
    return;
  }
  if (["history", "stats", "profile"].includes(state.view)) {
    state.view = "home";
    render();
  }
}

function pushRoute(view) {
  history.pushState({ aces: true, view }, "", `#${view}`);
}
function replaceRoute(view) {
  state.view = view;
  history.replaceState({ aces: true, view }, "", `#${view}`);
}

function selectedFolder() { return state.folders.find((folder) => folder.id === state.selectedFolderId); }
function folderQuizzes() { return state.quizzes.filter((quiz) => quiz.folderId === state.selectedFolderId); }
function choiceEntries(question) { return [["A", question.choiceA], ["B", question.choiceB], ["C", question.choiceC], ["D", question.choiceD]]; }
function stringField(value) { return typeof value === "string" ? value.trim() : ""; }
function numberField(value, fallback) { return Number.isFinite(Number(value)) ? Number(value) : fallback; }
function percent(score, total) { return total ? Math.round((score / total) * 100) : 0; }
function buildAttempt(quiz, mode, score, totalItems, unansweredCount, startedAtEpochMillis) {
  const attemptId = crypto.randomUUID();
  const answeredCount = Math.max(0, totalItems - unansweredCount);
  const completedAtEpochMillis = Date.now();
  return {
    id: attemptId,
    attemptId,
    ownerUid: state.user.uid,
    quizId: quiz.id,
    quizTitle: quiz.title,
    mode,
    score,
    answeredCount,
    totalItems,
    incorrectCount: answeredCount - score,
    unansweredCount,
    startedAtEpochMillis: Math.min(startedAtEpochMillis || completedAtEpochMillis, completedAtEpochMillis),
    completedAtEpochMillis,
    quizVersion: quiz.version || 0,
    schemaVersion: 1,
    percentage: percent(score, totalItems),
    cloudSyncState: "PENDING",
    cloudSyncedAtEpochMillis: null
  };
}

function computeStats(attempts) {
  const sortedAsc = [...attempts].sort((a, b) => a.completedAtEpochMillis - b.completedAtEpochMillis);
  const totalQuestions = attempts.reduce((sum, item) => sum + item.answeredCount, 0);
  const totalCorrect = attempts.reduce((sum, item) => sum + item.score, 0);
  const percentages = attempts.map((item) => item.percentage);
  const mode = (name) => {
    const items = attempts.filter((item) => item.mode === name);
    const questions = items.reduce((sum, item) => sum + item.answeredCount, 0);
    const correct = items.reduce((sum, item) => sum + item.score, 0);
    return { count: items.length, accuracy: percent(correct, questions) };
  };
  const groups = new Map();
  for (const attempt of attempts) {
    const key = attempt.quizId;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(attempt);
  }
  const byQuiz = [...groups.entries()].map(([quizId, items]) => {
    const ordered = [...items].sort((a, b) => b.completedAtEpochMillis - a.completedAtEpochMillis);
    const total = items.reduce((sum, item) => sum + item.answeredCount, 0);
    const correct = items.reduce((sum, item) => sum + item.score, 0);
    return {
      quizId,
      quizTitle: ordered[0].quizTitle,
      attempts: items,
      latest: ordered[0].percentage,
      average: Math.round(items.reduce((sum, item) => sum + item.percentage, 0) / items.length),
      best: Math.max(...items.map((item) => item.percentage)),
      accuracy: percent(correct, total)
    };
  }).sort((a, b) => a.quizTitle.localeCompare(b.quizTitle));
  return {
    overall: percent(totalCorrect, totalQuestions),
    average: Math.round(percentages.reduce((sum, value) => sum + value, 0) / percentages.length),
    best: Math.max(...percentages),
    latest: sortedAsc.at(-1).percentage,
    totalAttempts: attempts.length,
    totalQuestions,
    game: mode("GAME"),
    exam: mode("EXAM"),
    recent: sortedAsc.slice(-7),
    byQuiz
  };
}

function openResetPasswordModal(prefill = "", signedIn = false) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><form class="modal" id="reset-form"><div class="modal-header"><h2>Reset Password</h2></div><div class="modal-body"><p>${signedIn ? "A password-reset link will be sent to your signed-in email." : "Enter the email address connected to your ACES LET account."}</p><div class="field"><label for="reset-email">Email address</label><input id="reset-email" type="email" required value="${escapeAttr(prefill)}" ${signedIn ? "readonly" : ""}></div><div class="error-text" id="reset-error"></div></div><div class="modal-actions"><button class="secondary-button" id="modal-close" type="button">Cancel</button><button class="primary-button" id="reset-submit" type="submit">Send Reset Link</button></div></form></div>`;
  document.querySelector("#modal-close").addEventListener("click", closeModal);
  document.querySelector("#reset-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.querySelector("#reset-email").value.trim();
    const button = document.querySelector("#reset-submit");
    button.disabled = true;
    button.textContent = "Sending…";
    try {
      await sendPasswordResetEmail(state.auth, email);
      closeModal();
      openInfoModal("Check your email", "If an ACES LET account is connected to this email address, a password-reset link has been sent. Check your inbox and spam folder.");
    } catch {
      // Keep the response generic to avoid revealing whether an account exists.
      closeModal();
      openInfoModal("Check your email", "If an ACES LET account is connected to this email address, a password-reset link has been sent. Check your inbox and spam folder.");
    }
  });
}

function openConfirmModal(title, message, confirmLabel, onConfirm) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-header"><h2>${escapeHtml(title)}</h2></div><div class="modal-body"><p>${escapeHtml(message)}</p></div><div class="modal-actions"><button class="secondary-button" id="modal-close">Cancel</button><button class="danger-button" id="modal-confirm">${escapeHtml(confirmLabel)}</button></div></section></div>`;
  document.querySelector("#modal-close").addEventListener("click", closeModal);
  document.querySelector("#modal-confirm").addEventListener("click", async () => { closeModal(); await onConfirm(); });
}

function openInfoModal(title, message) {
  modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal"><div class="modal-header"><h2>${escapeHtml(title)}</h2></div><div class="modal-body"><p>${escapeHtml(message)}</p></div><div class="modal-actions"><button class="primary-button" id="modal-close">OK</button></div></section></div>`;
  document.querySelector("#modal-close").addEventListener("click", closeModal);
}
function closeModal() { modalRoot.innerHTML = ""; }

function emptyState(icon, title, message) { return `<div class="empty-state"><div class="empty-icon">${icon}</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p></div>`; }
function loadingOverlay(message) { return `<div class="loading-overlay"><div><div class="spinner"></div><strong>${escapeHtml(message)}</strong></div></div>`; }
function toast(message) {
  toastRoot.innerHTML = `<div class="toast">${escapeHtml(message)}</div>`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toastRoot.innerHTML = ""; }, 3400);
}
function getInitials(value) {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "AL";
}
function formatDateTime(epoch) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(epoch));
}
function friendlyError(error) { return error?.message || "Unknown error"; }
function catalogErrorMessage(error) {
  if (!navigator.onLine) return "Connect to the internet to refresh the quiz list.";
  if (error?.code === "permission-denied") return "You don’t have access to the available quizzes.";
  return "The quiz list could not be loaded. Please try again.";
}
function questionErrorMessage(error) {
  if (!navigator.onLine) return "Connect to the internet to open this quiz.";
  if (["NO_QUESTIONS", "COUNT_MISMATCH", "DUPLICATE_ORDER", "INVALID_QUESTION"].includes(error?.message)) return "This quiz is not ready. Please contact the ACES LET administrator.";
  if (error?.code === "permission-denied") return "You don’t have access to this quiz.";
  return "The quiz could not be opened. Please try again.";
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}
function escapeAttr(value) { return escapeHtml(value).replace(/`/g, "&#96;"); }

function openLocalDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("aces-let-web", 2);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("attempts")) {
        const attempts = database.createObjectStore("attempts", { keyPath: "id" });
        attempts.createIndex("ownerUid", "ownerUid", { unique: false });
      }
      if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles", { keyPath: "ownerUid" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveAttempt(attempt, triggerSync = true) {
  const database = await dbPromise;
  const result = await transactionPromise(database, "attempts", "readwrite", (store) => store.put(attempt));
  if (triggerSync) retryCloudSync();
  return result;
}
async function getAttempts(uid) {
  const database = await dbPromise;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("attempts", "readonly");
    const request = transaction.objectStore("attempts").index("ownerUid").getAll(uid);
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
async function saveProfile(profile, triggerSync = true) {
  const database = await dbPromise;
  const result = await transactionPromise(database, "profiles", "readwrite", (store) => store.put(profile));
  if (triggerSync) retryCloudSync();
  return result;
}
async function getProfile(uid) {
  const database = await dbPromise;
  return new Promise((resolve, reject) => {
    const request = database.transaction("profiles", "readonly").objectStore("profiles").get(uid);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
function transactionPromise(database, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}
