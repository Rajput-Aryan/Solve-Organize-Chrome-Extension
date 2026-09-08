// HackerRank's DOM varies more across challenge types (algorithms vs SQL vs
// AI vs interview-prep tracks) than LeetCode's, so this detector is
// deliberately best-effort: it watches the page for common "you solved it"
// text patterns rather than relying on one fixed selector or network call.

(function () {
  if (window.__hrOrganizerInstalled) return;
  window.__hrOrganizerInstalled = true;

  const SUCCESS_PATTERNS = [
    /all test cases passed/i,
    /you have successfully solved/i,
    /submission accepted/i,
  ];

  const FAILURE_PATTERNS = [
    /wrong answer/i,
    /compilation error/i,
    /runtime error/i,
    /terminated due to timeout/i,
  ];

  let notified = false;
  let currentSlug = getSlug();

  // SPA navigation handling
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      const newSlug = getSlug();
      if (newSlug !== currentSlug) {
        currentSlug = newSlug;
        notified = false;
      }
    }
  }, 1000);

  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("button, div, span") : null;
    if (btn && btn.textContent && /submit/i.test(btn.textContent)) {
      notified = false;
    }
  }, true);

  function getSlug() {
    const m = window.location.pathname.match(/\/challenges\/([^/]+)/);
    return m ? m[1] : "unknown-challenge";
  }

  function getTitle() {
    const el = document.querySelector(".challenge-page-label, h1");
    if (el && el.textContent.trim()) return el.textContent.trim();
    return document.title.replace(/\s*\|\s*HackerRank\s*$/i, "").trim();
  }

  function getTopics() {
    const topics = new Set();
    document.querySelectorAll('a[href*="/domains/"]').forEach((a) => {
      const t = a.textContent.trim();
      if (t) topics.add(t);
    });
    return Array.from(topics);
  }

  function getLanguage() {
    const el = document.querySelector("[class*='language'] button, select[name='language']");
    if (el) return (el.value || el.textContent || "plaintext").trim();
    return "plaintext";
  }

  function getCode() {
    try {
      const cmEl = document.querySelector(".CodeMirror");
      if (cmEl && cmEl.CodeMirror) return cmEl.CodeMirror.getValue();
    } catch (e) {}
    try {
      if (window.monaco && window.monaco.editor) {
        const models = window.monaco.editor.getModels();
        if (models && models.length) return models[0].getValue();
      }
    } catch (e) {}
    return null;
  }

  function getDescription() {
    const el =
      document.querySelector(".challenge-body-html") ||
      document.querySelector(".problem-statement") ||
      document.querySelector(".challenge-description");
    if (el) {
      let text = el.innerText.trim();
      text = text.replace(/\n{3,}/g, "\n\n");
      if (text.length > 30) return text;
    }
    return "";
  }

  function sendAccepted() {
    const payload = {
      platform: "hackerrank",
      slug: getSlug(),
      title: getTitle(),
      difficulty: "Unknown",
      topics: getTopics(),
      language: getLanguage(),
      code: getCode(),
      description: getDescription(),
      url: window.location.href,
      solvedAt: new Date().toISOString(),
    };
    chrome.runtime.sendMessage({ type: "SUBMISSION_ACCEPTED", data: payload }, () => {
      void chrome.runtime.lastError;
    });
  }

  function showSyncToast(payload) {
    try {
      const existing = document.getElementById("solve-organize-toast-root");
      if (existing) existing.remove();

      const host = document.createElement("div");
      host.id = "solve-organize-toast-root";
      const shadow = host.attachShadow({ mode: "closed" });

      const isSuccess = payload.status === "success";
      const isSkipped = payload.status === "skipped";
      const borderColor = isSuccess ? "#238636" : isSkipped ? "#d29922" : "#da3633";
      const iconColor = isSuccess ? "#3fb950" : isSkipped ? "#e3b341" : "#f85149";
      const badgeText = isSuccess ? "Synced to GitHub" : isSkipped ? "Already Saved" : "Sync Failed";
      const icon = isSuccess ? "✓" : isSkipped ? "ℹ" : "✗";

      const linkHtml = payload.repoUrl
        ? `<a href="${payload.repoUrl}" target="_blank" rel="noopener noreferrer">View in Repo ↗</a>`
        : "";

      shadow.innerHTML = `
        <style>
          .toast-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 2147483647;
            background: #0d1117;
            color: #c9d1d9;
            border: 1px solid ${borderColor};
            border-left: 4px solid ${borderColor};
            border-radius: 8px;
            padding: 12px 16px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 13px;
            line-height: 1.4;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            max-width: 380px;
            animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            pointer-events: auto;
          }
          @keyframes slideIn {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .icon-badge {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.08);
            color: ${iconColor};
            font-weight: bold;
            font-size: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          }
          .content {
            flex: 1;
          }
          .header-row {
            display: flex;
            align-items: center;
            gap: 6px;
            margin-bottom: 2px;
          }
          .badge-title {
            font-weight: 600;
            color: #f0f6fc;
            font-size: 13px;
          }
          .problem-title {
            color: #8b949e;
            font-size: 12px;
            margin-bottom: 4px;
            word-break: break-word;
          }
          .meta-msg {
            font-size: 11px;
            color: #7d8590;
          }
          a {
            color: #58a6ff;
            text-decoration: none;
            font-weight: 500;
            margin-left: 6px;
          }
          a:hover {
            text-decoration: underline;
          }
          .close-btn {
            background: transparent;
            border: none;
            color: #6e7681;
            cursor: pointer;
            font-size: 14px;
            padding: 0;
            margin-left: 4px;
            line-height: 1;
          }
          .close-btn:hover {
            color: #c9d1d9;
          }
        </style>
        <div class="toast-container">
          <div class="icon-badge">${icon}</div>
          <div class="content">
            <div class="header-row">
              <span class="badge-title">${badgeText}</span>
            </div>
            <div class="problem-title">${payload.title || "Problem"}</div>
            <div class="meta-msg">${payload.message || ""} ${linkHtml}</div>
          </div>
          <button class="close-btn" aria-label="Close">×</button>
        </div>
      `;

      const closeBtn = shadow.querySelector(".close-btn");
      closeBtn.addEventListener("click", () => host.remove());

      document.body.appendChild(host);
      setTimeout(() => {
        if (document.body.contains(host)) {
          host.remove();
        }
      }, 5500);
    } catch (e) {
      console.warn("[Solve & Organize] Failed to render in-page toast:", e);
    }
  }

  // Listen for toast messages from background worker
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "SHOW_TOAST" && msg.payload) {
      showSyncToast(msg.payload);
    }
  });

  const observer = new MutationObserver(() => {
    if (notified) return;
    const bodyText = document.body ? document.body.innerText : "";
    if (FAILURE_PATTERNS.some((p) => p.test(bodyText))) {
      return;
    }
    if (SUCCESS_PATTERNS.some((p) => p.test(bodyText))) {
      notified = true;
      setTimeout(sendAccepted, 600);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
