import { testConnection, fetchIndex } from "../lib/github.js";
import { startDeviceFlow, pollDeviceToken, fetchUserProfile, DEFAULT_CLIENT_ID } from "../lib/auth.js";

const DEFAULT_SETTINGS = {
  token: "",
  owner: "",
  repo: "",
  branch: "main",
  groupByTopic: true,
  groupByDifficulty: true,
  onlyAddIfNotExists: true,
  userProfile: null,
};

const els = {
  token: document.getElementById("token"),
  owner: document.getElementById("owner"),
  repo: document.getElementById("repo"),
  branch: document.getElementById("branch"),
  groupByTopic: document.getElementById("groupByTopic"),
  groupByDifficulty: document.getElementById("groupByDifficulty"),
  onlyAddIfNotExists: document.getElementById("onlyAddIfNotExists"),
  saveBtn: document.getElementById("saveBtn"),
  testBtn: document.getElementById("testBtn"),
  settingsMsg: document.getElementById("settingsMsg"),
  connStatus: document.getElementById("connStatus"),
  activityList: document.getElementById("activityList"),
  refreshActivity: document.getElementById("refreshActivity"),
  clearActivity: document.getElementById("clearActivity"),
  loadTopics: document.getElementById("loadTopics"),
  topicSelect: document.getElementById("topicSelect"),
  diffSelect: document.getElementById("diffSelect"),
  filterResults: document.getElementById("filterResults"),

  // Auth Elements
  signInBtn: document.getElementById("signInBtn"),
  loggedOutView: document.getElementById("loggedOutView"),
  devicePromptView: document.getElementById("devicePromptView"),
  loggedInView: document.getElementById("loggedInView"),
  userCodeText: document.getElementById("userCodeText"),
  copyCodeBtn: document.getElementById("copyCodeBtn"),
  authUrlLink: document.getElementById("authUrlLink"),
  deviceStatusText: document.getElementById("deviceStatusText"),
  cancelAuthBtn: document.getElementById("cancelAuthBtn"),
  userAvatar: document.getElementById("userAvatar"),
  userName: document.getElementById("userName"),
  userLogin: document.getElementById("userLogin"),
  signOutBtn: document.getElementById("signOutBtn"),
};

let activeAuthPoll = null;

// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------- Device Flow Auth Handlers ----------
function showAuthState(state) {
  if (els.loggedOutView) els.loggedOutView.style.display = state === "loggedOut" ? "block" : "none";
  if (els.devicePromptView) els.devicePromptView.style.display = state === "prompt" ? "flex" : "none";
  if (els.loggedInView) els.loggedInView.style.display = state === "loggedIn" ? "flex" : "none";
}

function renderUserProfile(profile) {
  if (!profile) return;
  if (els.userAvatar) els.userAvatar.src = profile.avatar_url || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";
  if (els.userName) els.userName.textContent = profile.name || profile.login;
  if (els.userLogin) els.userLogin.textContent = `@${profile.login}`;
}

els.signInBtn.addEventListener("click", async () => {
  els.settingsMsg.textContent = "";
  els.signInBtn.disabled = true;
  els.signInBtn.textContent = "Connecting to GitHub...";

  try {
    const flow = await startDeviceFlow(DEFAULT_CLIENT_ID);

    els.userCodeText.textContent = flow.user_code;
    els.authUrlLink.href = flow.verification_uri;
    els.deviceStatusText.textContent = "Waiting for authorization...";
    showAuthState("prompt");

    // Automatically open the GitHub verification page in a new browser tab
    if (chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: flow.verification_uri });
    }

    // Start polling GitHub for the token
    const pollPromise = pollDeviceToken(
      DEFAULT_CLIENT_ID,
      flow.device_code,
      flow.interval,
      (status) => {
        if (els.deviceStatusText) els.deviceStatusText.textContent = status;
      }
    );
    activeAuthPoll = pollPromise;

    const { accessToken } = await pollPromise;

    // Save token & fetch profile
    els.token.value = accessToken;
    const profile = await fetchUserProfile(accessToken);
    if (!els.owner.value || els.owner.value === "") {
      els.owner.value = profile.login;
    }

    await chrome.storage.sync.set({
      token: accessToken,
      owner: els.owner.value || profile.login,
      userProfile: profile,
    });

    renderUserProfile(profile);
    showAuthState("loggedIn");
    els.connStatus.classList.remove("err");
    els.connStatus.classList.add("ok");
    els.settingsMsg.textContent = `Connected as ${profile.login}!`;
    els.settingsMsg.className = "msg ok";
  } catch (err) {
    els.settingsMsg.textContent = err.message;
    els.settingsMsg.className = "msg err";
    showAuthState("loggedOut");
  } finally {
    els.signInBtn.disabled = false;
    els.signInBtn.innerHTML = `
      <svg height="18" width="18" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
      </svg>
      Sign in with GitHub (1-Click)
    `;
  }
});

els.copyCodeBtn.addEventListener("click", () => {
  const code = els.userCodeText.textContent;
  navigator.clipboard.writeText(code).then(() => {
    els.copyCodeBtn.textContent = "Copied!";
    setTimeout(() => {
      els.copyCodeBtn.textContent = "Copy";
    }, 2000);
  });
});

els.cancelAuthBtn.addEventListener("click", () => {
  showAuthState("loggedOut");
  els.settingsMsg.textContent = "Sign-in cancelled.";
  els.settingsMsg.className = "msg";
});

els.signOutBtn.addEventListener("click", async () => {
  els.token.value = "";
  await chrome.storage.sync.set({ token: "", userProfile: null });
  showAuthState("loggedOut");
  els.connStatus.classList.remove("ok");
  els.settingsMsg.textContent = "Signed out.";
  els.settingsMsg.className = "msg";
});

// ---------- Settings ----------
async function loadSettings() {
  const settings = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  els.token.value = settings.token;
  els.owner.value = settings.owner;
  els.repo.value = settings.repo;
  els.branch.value = settings.branch || "main";
  els.groupByTopic.checked = settings.groupByTopic !== false;
  els.groupByDifficulty.checked = settings.groupByDifficulty !== false;
  els.onlyAddIfNotExists.checked = settings.onlyAddIfNotExists !== false;

  if (settings.token) {
    if (settings.userProfile) {
      renderUserProfile(settings.userProfile);
      showAuthState("loggedIn");
    } else {
      fetchUserProfile(settings.token)
        .then((profile) => {
          chrome.storage.sync.set({ userProfile: profile });
          renderUserProfile(profile);
          showAuthState("loggedIn");
        })
        .catch(() => {
          showAuthState("loggedOut");
        });
    }
    if (settings.owner && settings.repo) {
      els.connStatus.classList.add("ok");
      els.connStatus.title = "Configured";
    }
  } else {
    showAuthState("loggedOut");
  }
}

function currentSettings() {
  return {
    token: els.token.value.trim(),
    owner: els.owner.value.trim(),
    repo: els.repo.value.trim(),
    branch: els.branch.value.trim() || "main",
    groupByTopic: els.groupByTopic.checked,
    groupByDifficulty: els.groupByDifficulty.checked,
    onlyAddIfNotExists: els.onlyAddIfNotExists.checked,
  };
}

els.saveBtn.addEventListener("click", async () => {
  const settings = currentSettings();
  await chrome.storage.sync.set(settings);
  els.settingsMsg.textContent = "Saved.";
  els.settingsMsg.className = "msg ok";
});

els.testBtn.addEventListener("click", async () => {
  const settings = currentSettings();
  els.settingsMsg.textContent = "Checking…";
  els.settingsMsg.className = "msg";
  try {
    const { login } = await testConnection(settings);
    els.settingsMsg.textContent = `Connected as ${login}. Repo access confirmed.`;
    els.settingsMsg.className = "msg ok";
    els.connStatus.classList.remove("err");
    els.connStatus.classList.add("ok");
  } catch (err) {
    els.settingsMsg.textContent = err.message;
    els.settingsMsg.className = "msg err";
    els.connStatus.classList.remove("ok");
    els.connStatus.classList.add("err");
  }
});

// ---------- Activity ----------
function renderActivity(activityLog, pendingQueue = []) {
  els.activityList.innerHTML = "";

  if (pendingQueue.length > 0) {
    for (const pending of pendingQueue) {
      const li = document.createElement("li");
      li.style.borderLeft = "3px solid #db6d28";
      li.innerHTML = `<span class="title" style="color:#f0883e;">⏳ ${pending.title || pending.slug} (Queued for retry)</span><span class="meta">${pending.platform} · ${pending.lastError || "Waiting for connection"}</span>`;
      els.activityList.appendChild(li);
    }
  }

  if ((!activityLog || activityLog.length === 0) && pendingQueue.length === 0) {
    els.activityList.innerHTML = '<li class="empty">No pushes yet — solve something on LeetCode, Codeforces, CodeChef, GeeksforGeeks, HackerRank, AtCoder, or NeetCode.</li>';
    return;
  }

  for (const entry of activityLog) {
    const li = document.createElement("li");
    if (!entry.ok) li.classList.add("err");
    const when = new Date(entry.at).toLocaleString();
    if (!entry.ok) {
      li.innerHTML = `<span class="title">✗ ${entry.title || "Push failed"}</span><span class="meta">${entry.error} · ${when}</span>`;
    } else if (entry.skipped) {
      li.innerHTML = `<span class="title" style="color:#e3b341;">ℹ ${entry.title || "Untitled"} (Skipped)</span><span class="meta">${entry.platform} → Already exists in platform folder (${entry.path}) · ${when}</span>`;
    } else {
      li.innerHTML = `<span class="title">✓ ${entry.title || "Untitled"}</span><span class="meta">${entry.platform} → ${entry.path} · ${when}</span>`;
    }
    els.activityList.appendChild(li);
  }
}

async function loadActivity() {
  const { activityLog = [], pendingQueue = [] } = await chrome.storage.local.get([
    "activityLog",
    "pendingQueue",
  ]);
  renderActivity(activityLog, pendingQueue);
}

els.refreshActivity.addEventListener("click", loadActivity);
els.clearActivity.addEventListener("click", async () => {
  await chrome.storage.local.set({ activityLog: [], pendingQueue: [] });
  loadActivity();
});

// ---------- Filter ----------
let cachedIndex = [];

els.loadTopics.addEventListener("click", async () => {
  const settings = currentSettings();
  if (!settings.token || !settings.owner || !settings.repo) {
    els.filterResults.innerHTML = '<li class="empty">Configure and save your settings first.</li>';
    return;
  }
  els.loadTopics.textContent = "Loading…";
  try {
    cachedIndex = await fetchIndex(settings);
    const topics = new Set();
    cachedIndex.forEach((e) => (e.topics || []).forEach((t) => topics.add(t)));

    els.topicSelect.innerHTML = '<option value="">All topics</option>';
    Array.from(topics)
      .sort()
      .forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = `${t} (${cachedIndex.filter((e) => (e.topics || []).includes(t)).length})`;
        els.topicSelect.appendChild(opt);
      });
    els.topicSelect.disabled = false;
    els.diffSelect.disabled = false;
    renderFilterResults();
  } catch (err) {
    els.filterResults.innerHTML = `<li class="empty">${err.message}</li>`;
  } finally {
    els.loadTopics.textContent = "Load topics & problems";
  }
});

function renderFilterResults() {
  const settings = currentSettings();
  const selectedTopic = els.topicSelect.value;
  const selectedDiff = (els.diffSelect.value || "").toLowerCase();

  let matches = cachedIndex;
  if (selectedTopic) {
    matches = matches.filter((e) => (e.topics || []).includes(selectedTopic));
  }
  if (selectedDiff) {
    matches = matches.filter((e) => (e.difficulty || "").toLowerCase() === selectedDiff);
  }

  els.filterResults.innerHTML = "";
  if (matches.length === 0) {
    els.filterResults.innerHTML = '<li class="empty">No problems found matching this filter.</li>';
    return;
  }
  for (const e of matches) {
    const li = document.createElement("li");
    const repoUrl = `https://github.com/${settings.owner}/${settings.repo}/tree/${settings.branch || "main"}/${e.path}`;
    li.innerHTML = `<span class="title">${e.title || e.key}</span><span class="meta">${e.platform} · ${e.difficulty || "Unrated"} · <a href="${repoUrl}" target="_blank" rel="noopener">view in repo</a></span>`;
    els.filterResults.appendChild(li);
  }
}

els.topicSelect.addEventListener("change", renderFilterResults);
els.diffSelect.addEventListener("change", renderFilterResults);

// ---------- Init ----------
loadSettings();
loadActivity();
