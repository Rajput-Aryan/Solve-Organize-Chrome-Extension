import { pushSolution } from "./lib/github.js";

const DEFAULT_SETTINGS = {
  token: "",
  owner: "",
  repo: "",
  branch: "main",
  groupByTopic: true,
  groupByDifficulty: true,
  onlyAddIfNotExists: true,
};

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  return stored;
}

async function logActivity(entry) {
  const { activityLog = [] } = await chrome.storage.local.get("activityLog");
  activityLog.unshift({ ...entry, at: new Date().toISOString() });
  await chrome.storage.local.set({ activityLog: activityLog.slice(0, 50) });
}

async function flashBadge(text, color) {
  try {
    await chrome.action.setBadgeBackgroundColor({ color });
    await chrome.action.setBadgeText({ text });
    setTimeout(() => chrome.action.setBadgeText({ text: "" }), 4000);
  } catch (e) {
    /* action API may be unavailable in some contexts — non-fatal */
  }
}

async function sendToastToTab(tabId, toastPayload) {
  if (!tabId) return;
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: "SHOW_TOAST",
      payload: toastPayload,
    });
  } catch (e) {
    /* Tab might be closed or doesn't accept messages — non-fatal */
  }
}

async function enqueuePending(data, errorMsg) {
  try {
    const { pendingQueue = [] } = await chrome.storage.local.get("pendingQueue");
    const exists = pendingQueue.some(
      (item) => item.platform === data.platform && item.slug === data.slug
    );
    if (!exists) {
      pendingQueue.push({ ...data, queuedAt: new Date().toISOString(), lastError: errorMsg });
      await chrome.storage.local.set({ pendingQueue });
      chrome.alarms.create("drainSyncQueue", { delayInMinutes: 1 });
    }
  } catch (e) {
    console.warn("[Solve & Organize] Failed to enqueue submission:", e);
  }
}

export async function drainQueue() {
  const { pendingQueue = [] } = await chrome.storage.local.get("pendingQueue");
  if (!pendingQueue.length) return;

  const settings = await getSettings();
  if (!settings.token || !settings.owner || !settings.repo) return;

  const remaining = [];
  for (const item of pendingQueue) {
    try {
      const result = await pushSolution(settings, item);
      await logActivity({
        ok: true,
        skipped: !!result.skipped,
        title: item.title,
        platform: item.platform,
        path: result.path,
        message: result.message || "Synced from retry queue",
      });
    } catch (e) {
      remaining.push({ ...item, retryCount: (item.retryCount || 0) + 1, lastError: e.message });
    }
  }
  await chrome.storage.local.set({ pendingQueue: remaining });
  if (remaining.length > 0) {
    chrome.alarms.create("drainSyncQueue", { delayInMinutes: 3 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "drainSyncQueue") {
    drainQueue();
  }
});

async function handleSubmission(data, sender) {
  const settings = await getSettings();
  if (!settings.token || !settings.owner || !settings.repo) {
    const notConfiguredMsg = "Not configured yet — open the extension popup and add your GitHub token, owner, and repo.";
    if (sender && sender.tab && sender.tab.id) {
      await sendToastToTab(sender.tab.id, {
        status: "error",
        title: data.title || data.slug,
        platform: data.platform,
        message: notConfiguredMsg,
      });
    }
    throw new Error(notConfiguredMsg);
  }

  const result = await pushSolution(settings, data);
  const repoUrl = `https://github.com/${settings.owner}/${settings.repo}/tree/${settings.branch || "main"}/${result.path}`;

  if (result.skipped) {
    await logActivity({
      ok: true,
      skipped: true,
      title: data.title,
      platform: data.platform,
      path: result.path,
      message: result.message,
    });
    await flashBadge("EXIST", "#e3b341");
    if (sender && sender.tab && sender.tab.id) {
      await sendToastToTab(sender.tab.id, {
        status: "skipped",
        title: data.title || data.slug,
        platform: data.platform,
        repoUrl,
        message: result.message || "Already exists in repo",
      });
    }
  } else {
    await logActivity({ ok: true, skipped: false, title: data.title, platform: data.platform, path: result.path });
    await flashBadge("✓", "#3fb950");
    if (sender && sender.tab && sender.tab.id) {
      await sendToastToTab(sender.tab.id, {
        status: "success",
        title: data.title || data.slug,
        platform: data.platform,
        repoUrl,
        message: `Synced to ${settings.owner}/${settings.repo}`,
      });
    }
  }
  return result;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === "SUBMISSION_ACCEPTED") {
    handleSubmission(message.data, sender)
      .then((result) => sendResponse({ ok: true, result }))
      .catch(async (err) => {
        console.error("[Solve & Organize] push failed:", err);
        await logActivity({ ok: false, title: message.data && message.data.title, error: err.message });
        await flashBadge("!", "#f85149");

        // Queue for background retry if it's a network/transient error
        if (message.data) {
          await enqueuePending(message.data, err.message);
        }

        if (sender && sender.tab && sender.tab.id) {
          await sendToastToTab(sender.tab.id, {
            status: "error",
            title: (message.data && message.data.title) || "Submission",
            platform: message.data && message.data.platform,
            message: err.message || "Push failed — queued for retry",
          });
        }

        sendResponse({ ok: false, error: err.message });
      });
    return true; // keep the message channel open for the async response
  }
  return false;
});

