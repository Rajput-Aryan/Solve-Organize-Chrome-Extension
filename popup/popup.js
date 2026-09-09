import { testConnection, fetchIndex } from "../lib/github.js";
import { fetchUserProfile } from "../lib/auth.js";

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
  connectBtn: document.getElementById("connectBtn"),
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
  loggedOutView: document.getElementById("loggedOutView"),
  loggedInView: document.getElementById("loggedInView"),
  userAvatar: document.getElementById("userAvatar"),
  userName: document.getElementById("userName"),
  userLogin: document.getElementById("userLogin"),
  signOutBtn: document.getElementById("signOutBtn"),
};

// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add("active");
  });
});

// ---------- Auth Handlers ----------
function showAuthState(state) {
  if (els.loggedOutView) els.loggedOutView.style.display = state === "loggedOut" ? "block" : "none";
  if (els.loggedInView) els.loggedInView.style.display = state === "loggedIn" ? "flex" : "none";
}

function renderUserProfile(profile) {
  if (!profile) return;
  if (els.userAvatar) els.userAvatar.src = profile.avatar_url || "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png";
  if (els.userName) els.userName.textContent = profile.name || profile.login;
  if (els.userLogin) els.userLogin.textContent = `@${profile.login}`;
}

async function handleConnect() {
  const token = (els.token.value || "").trim();
  if (!token) {
    els.settingsMsg.textContent = "Please enter a GitHub Personal Access Token.";
    els.settingsMsg.className = "msg err";
    return;
  }

  els.connectBtn.disabled = true;
  els.connectBtn.textContent = "Verifying…";
  els.settingsMsg.textContent = "Checking token with GitHub…";
  els.settingsMsg.className = "msg";

  try {
    const profile = await fetchUserProfile(token);
    if (!els.owner.value || els.owner.value.trim() === "") {
      els.owner.value = profile.login;
    }

    await chrome.storage.sync.set({
      token,
      owner: els.owner.value || profile.login,
      userProfile: profile,
    });

    renderUserProfile(profile);
    showAuthState("loggedIn");
    els.connStatus.classList.remove("err");
    els.connStatus.classList.add("ok");
    els.settingsMsg.textContent = `Connected as ${profile.login}! (Token saved)`;
    els.settingsMsg.className = "msg ok";
  } catch (err) {
    els.settingsMsg.textContent = `Connection failed (${err.message}). Check that your token is valid and has 'repo' scope.`;
    els.settingsMsg.className = "msg err";
    els.connStatus.classList.remove("ok");
    els.connStatus.classList.add("err");
    showAuthState("loggedOut");
  } finally {
    els.connectBtn.disabled = false;
    els.connectBtn.textContent = "Connect";
  }
}

if (els.connectBtn) {
  els.connectBtn.addEventListener("click", handleConnect);
}

if (els.token) {
  els.token.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConnect();
    }
  });
}

if (els.signOutBtn) {
  els.signOutBtn.addEventListener("click", async () => {
    els.token.value = "";
    await chrome.storage.sync.set({ token: "", userProfile: null });
    showAuthState("loggedOut");
    els.connStatus.classList.remove("ok");
    els.settingsMsg.textContent = "Disconnected. Token removed.";
    els.settingsMsg.className = "msg";
  });
}

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
