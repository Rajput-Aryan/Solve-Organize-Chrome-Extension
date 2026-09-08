// CodeChef solution scraper and detector script.
// Watches for 100 pts / Correct Answer / AC verdicts on CodeChef problem pages.

(function () {
  if (window.__ccOrganizerInstalled) return;
  window.__ccOrganizerInstalled = true;

  let notified = false;
  let currentSlug = getSlug();

  // SPA navigation watcher
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
    const m = window.location.pathname.match(/\/problems\/([^/?#]+)/i);
    return m ? m[1].toUpperCase() : "unknown-problem";
  }

  function getTitle() {
    const titleEl =
      document.querySelector("h1._title__container_1w3o5_43, h1, .problem-title") ||
      document.querySelector(".title");
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim().replace(/\s*\(.*\)$/, "");
    }
    return getSlug();
  }

  function getDifficulty() {
    const diffEl = document.querySelector("[class*='difficulty'], [class*='rating']");
    if (diffEl && diffEl.textContent.trim()) {
      const match = diffEl.textContent.match(/(\d{3,4})/);
      if (match) return match[1];
    }
    return "1000";
  }

  function getTopics() {
    const topics = new Set();
    document.querySelectorAll("a[href*='/tags/problems/'], [class*='tags'] a, .tag").forEach((el) => {
      const text = el.textContent.trim();
      if (text && text.length < 30) topics.add(text);
    });
    return topics.size > 0 ? Array.from(topics) : ["Practice"];
  }

  function getLanguage() {
    const langEl = document.querySelector("[class*='select-language'], [class*='language']");
    if (langEl) {
      const text = (langEl.value || langEl.textContent || "").toLowerCase();
      if (text.includes("c++") || text.includes("cpp")) return "c++";
      if (text.includes("java")) return "java";
      if (text.includes("python") || text.includes("py3")) return "python3";
      if (text.includes("c#")) return "c#";
      if (text.includes("c")) return "c";
      if (text.includes("javascript") || text.includes("node")) return "javascript";
    }
    return "c++";
  }

  function getCode() {
    // 1. Monaco Editor (modern CodeChef)
    const monacoLines = document.querySelectorAll(".monaco-editor .view-line");
    if (monacoLines && monacoLines.length > 0) {
      const code = Array.from(monacoLines)
        .map((line) => line.textContent.replace(/\u00a0/g, " "))
        .join("\n");
      if (code.trim()) return code;
    }

    // 2. Ace Editor
    const aceLines = document.querySelectorAll(".ace_line");
    if (aceLines && aceLines.length > 0) {
      const code = Array.from(aceLines)
        .map((line) => line.textContent)
        .join("\n");
      if (code.trim()) return code;
    }

    // 3. Fallback textarea
    const ta = document.querySelector("textarea#custom-input, textarea.editor");
    if (ta && ta.value && ta.value.trim().length > 15) return ta.value;

    return null;
  }

  function getDescription() {
    const el = document.querySelector(".problem-statement, .problem-description, [class*='problem_statement']");
    if (!el) return "";

    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, style, button, input, textarea").forEach((n) => n.remove());

    let rawText = clone.innerText || clone.textContent || "";
    let formatted = rawText
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    return formatted.length > 20 ? formatted : "";
  }

  function sendAccepted() {
    const payload = {
      platform: "codechef",
      slug: getSlug(),
      title: getTitle(),
      difficulty: getDifficulty(),
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
        if (document.body.contains(host)) host.remove();
      }, 5500);
    } catch (e) {
      console.warn("[Solve & Organize] Toast error:", e);
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "SHOW_TOAST" && msg.payload) {
      showSyncToast(msg.payload);
    }
  });

  const observer = new MutationObserver(() => {
    if (notified) return;
    const bodyText = document.body ? document.body.innerText : "";

    const isAccepted =
      /100\s*(?:pts|points|\/100)/i.test(bodyText) ||
      /correct answer/i.test(bodyText) ||
      /accepted/i.test(bodyText);

    if (isAccepted) {
      const isFailed = /wrong answer|runtime error|time limit exceeded/i.test(bodyText);
      if (!isFailed) {
        notified = true;
        setTimeout(sendAccepted, 800);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
