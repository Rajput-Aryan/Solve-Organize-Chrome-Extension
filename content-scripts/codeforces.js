// Codeforces solution scraper and detector script.
// Watches for Accepted / OK verdicts on Codeforces problem and submission pages.

(function () {
  if (window.__cfOrganizerInstalled) return;
  window.__cfOrganizerInstalled = true;

  let notified = false;
  let currentSlug = getSlug();

  // SPA / Hash navigation watcher
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

  function getSlug() {
    // Matches /problemset/problem/158/A or /contest/158/problem/A or /gym/100001/problem/A
    const mProblemset = window.location.pathname.match(/\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)/i);
    if (mProblemset) return `${mProblemset[1]}${mProblemset[2]}`.toUpperCase();

    const mContest = window.location.pathname.match(/\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/i);
    if (mContest) return `${mContest[1]}${mContest[2]}`.toUpperCase();

    return "unknown-cf-problem";
  }

  function getTitle() {
    const titleEl = document.querySelector(".problem-statement .title") || document.querySelector("h1");
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim().replace(/^[A-Z0-9]+\.\s*/i, "");
    }
    return document.title.replace(/\s*-\s*Codeforces\s*$/i, "").trim();
  }

  function getDifficulty() {
    const diffEl = document.querySelector("span[title='Difficulty'], span.tag-box[title*='Difficulty']");
    if (diffEl) {
      const match = diffEl.textContent.match(/\*?(\d+)/);
      if (match) return match[1];
    }
    const tags = document.querySelectorAll("span.tag-box");
    for (const tag of tags) {
      const match = tag.textContent.trim().match(/^\*(\d+)$/);
      if (match) return match[1];
    }
    return "800";
  }

  function getTopics() {
    const topics = new Set();
    document.querySelectorAll("span.tag-box").forEach((el) => {
      const text = el.textContent.trim();
      if (text && !text.startsWith("*")) {
        topics.add(text);
      }
    });
    return topics.size > 0 ? Array.from(topics) : ["Implementation"];
  }

  function getLanguage() {
    const langSelect = document.querySelector("select[name='programTypeId']");
    if (langSelect && langSelect.selectedOptions && langSelect.selectedOptions.length) {
      const text = langSelect.selectedOptions[0].textContent.toLowerCase();
      if (text.includes("c++") || text.includes("g++") || text.includes("clang++")) return "c++";
      if (text.includes("java")) return "java";
      if (text.includes("python") || text.includes("pypy")) return "python3";
      if (text.includes("rust")) return "rust";
      if (text.includes("kotlin")) return "kotlin";
      if (text.includes("go")) return "go";
      if (text.includes("c#")) return "c#";
      if (text.includes("javascript") || text.includes("node")) return "javascript";
    }
    return "c++";
  }

  function getCode() {
    // 1. Check Codeforces source textareas
    const srcEl = document.querySelector("textarea#sourceCodeTextarea, textarea[name='source'], #editor");
    if (srcEl && srcEl.value && srcEl.value.trim().length > 15) {
      return srcEl.value;
    }

    // 2. Check Ace editor
    try {
      if (window.ace) {
        const aceEditor = window.ace.edit(document.querySelector(".ace_editor"));
        if (aceEditor) return aceEditor.getValue();
      }
    } catch (e) {}

    // 3. Check submitted source popup/modal pre code
    const preEl = document.querySelector("pre#program-source-text, pre.program-source");
    if (preEl && preEl.textContent.trim()) {
      return preEl.textContent;
    }

    return null;
  }

  function getDescription() {
    const el = document.querySelector(".problem-statement");
    if (!el) return "";

    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, style, button, input, textarea").forEach((n) => n.remove());

    clone.querySelectorAll("sup").forEach((sup) => sup.replaceWith(`^${sup.textContent.trim()}`));
    clone.querySelectorAll("sub").forEach((sub) => sub.replaceWith(`_${sub.textContent.trim()}`));
    clone.querySelectorAll("code, .tex-formula").forEach((c) => c.replaceWith(` \`${c.textContent.trim()}\` `));

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
      platform: "codeforces",
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

  // Listen for background toast messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "SHOW_TOAST" && msg.payload) {
      showSyncToast(msg.payload);
    }
  });

  // Watch for Accepted verdicts in DOM
  const observer = new MutationObserver(() => {
    if (notified) return;
    const acceptedElements = document.querySelectorAll(
      ".verdict-accepted, span.verdict-accepted, span[verdict='OK'], span[verdict='ACCEPTED']"
    );

    if (acceptedElements && acceptedElements.length > 0) {
      notified = true;
      setTimeout(sendAccepted, 800);
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
