// NeetCode solution scraper and detector script.
// Watches for Accepted / All tests passed verdicts on NeetCode problem pages.

(function () {
  if (window.__ncOrganizerInstalled) return;
  window.__ncOrganizerInstalled = true;

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
    return m ? m[1].toLowerCase() : "unknown-problem";
  }

  function getTitle() {
    const titleEl = document.querySelector("h1, h2, [class*='problem-title'], [class*='text-xl']");
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    const slug = getSlug();
    return slug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  function getDifficulty() {
    const nodes = document.querySelectorAll("span, div, button");
    for (const el of nodes) {
      const text = el.textContent.trim();
      if (text === "Easy" || text === "Medium" || text === "Hard") {
        return text;
      }
    }
    return "Medium";
  }

  function getTopics() {
    const topics = new Set();
    document.querySelectorAll("a[href*='/practice'], [class*='badge'], [class*='tag']").forEach((el) => {
      const text = el.textContent.trim();
      if (
        text &&
        text.length < 30 &&
        !text.includes("Submit") &&
        !text.includes("Run") &&
        !text.includes("NeetCode")
      ) {
        topics.add(text);
      }
    });

    if (topics.size > 0) return Array.from(topics);

    // Fallback: Infer from slug
    const s = getSlug();
    if (s.includes("duplicate") || s.includes("anagram") || s.includes("two-sum") || s.includes("group")) {
      return ["Arrays & Hashing"];
    }
    if (s.includes("palindrome") || s.includes("pointer") || s.includes("water")) {
      return ["Two Pointers"];
    }
    if (s.includes("tree") || s.includes("bst") || s.includes("depth")) {
      return ["Trees"];
    }
    if (s.includes("graph") || s.includes("island") || s.includes("course")) {
      return ["Graphs"];
    }
    return ["Algorithms"];
  }

  function getLanguage() {
    const langBtn = document.querySelector("[class*='language'], button[class*='lang']");
    if (langBtn) {
      const text = (langBtn.textContent || "").toLowerCase();
      if (text.includes("python")) return "python3";
      if (text.includes("java")) return "java";
      if (text.includes("c++") || text.includes("cpp")) return "c++";
      if (text.includes("javascript") || text.includes("js")) return "javascript";
      if (text.includes("typescript") || text.includes("ts")) return "typescript";
      if (text.includes("c#")) return "c#";
      if (text.includes("go")) return "go";
      if (text.includes("rust")) return "rust";
    }
    return "python3";
  }

  function getCode() {
    // 1. Monaco Editor lines
    const monacoLines = document.querySelectorAll(".monaco-editor .view-line");
    if (monacoLines && monacoLines.length > 0) {
      const code = Array.from(monacoLines)
        .map((line) => line.textContent.replace(/\u00a0/g, " "))
        .join("\n");
      if (code.trim()) return code;
    }

    // 2. Textarea fallback
    const ta = document.querySelector("textarea");
    if (ta && ta.value && ta.value.trim().length > 15) return ta.value;

    return null;
  }

  function getDescription() {
    const el = document.querySelector("[class*='description'], [class*='problem-body'], main");
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
      platform: "neetcode",
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
      /all tests passed/i.test(bodyText) ||
      /accepted/i.test(bodyText) ||
      /test cases passed/i.test(bodyText);

    if (isAccepted) {
      const isFailed = /wrong answer|failed|compilation error/i.test(bodyText);
      if (!isFailed) {
        notified = true;
        setTimeout(sendAccepted, 800);
      }
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
