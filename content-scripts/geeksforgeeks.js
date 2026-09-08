// GeeksforGeeks solution scraper and detector script.
// Watches for successful submission events on GFG problem pages and pushes
// solution metadata and source code to the background service worker.

(function () {
  if (window.__gfgOrganizerInstalled) return;
  window.__gfgOrganizerInstalled = true;

  const FAILURE_PATTERNS = [
    /wrong answer/i,
    /compilation error/i,
    /runtime error/i,
    /time limit exceeded/i,
    /memory limit exceeded/i,
  ];

  const STRICT_SUCCESS_PATTERNS = [
    /problem solved successfully/i,
    /correct answer/i,
    /all test cases passed/i,
  ];

  let notified = false;
  let currentSlug = getSlug();
  console.log("[Solve & Organize] GFG content script loaded into page.");

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

  // Reset notification flag whenever user clicks Submit button
  document.addEventListener("click", (e) => {
    const btn = e.target && e.target.closest ? e.target.closest("button, div, span") : null;
    if (btn && btn.textContent && /submit/i.test(btn.textContent)) {
      notified = false;
      console.log("[Solve & Organize] Submit button clicked — listening for result...");
    }
  }, true);

  function getSlug() {
    const m = window.location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : "unknown-problem";
  }

  function getTitle() {
    const titleEl =
      document.querySelector(".problems_header_content__title") ||
      document.querySelector(".problem-tab-header-title") ||
      document.querySelector("h3") ||
      document.querySelector("h1");
    if (titleEl && titleEl.textContent.trim()) {
      return titleEl.textContent.trim();
    }
    return document.title
      .replace(/\|.*$/i, "")
      .replace(/GeeksforGeeks/i, "")
      .trim();
  }

  function getDifficulty() {
    const DIFFICULTIES = ["School", "Basic", "Easy", "Medium", "Hard"];
    // 1. Check specific GFG difficulty badges / headers
    const badge = document.querySelector("[class*='difficulty'], [class*='Difficulty'], .problem-difficulty");
    if (badge) {
      const text = badge.textContent.trim();
      for (const d of DIFFICULTIES) {
        if (new RegExp(`\\b${d}\\b`, "i").test(text)) return d;
      }
    }
    // 2. Fallback: scan text nodes
    const nodes = document.querySelectorAll("div, span, button, p, a");
    for (const el of nodes) {
      const text = el.textContent.trim();
      for (const d of DIFFICULTIES) {
        if (text.toLowerCase() === d.toLowerCase()) return d;
      }
    }
    return "Easy"; // Reasonable fallback default for GFG problem if undetected
  }

  function getTopics() {
    const topics = new Set();
    // 1. Scrape explicit topic tags from DOM
    document
      .querySelectorAll(
        'a[href*="/topics/"], a[href*="/tag/"], a[href*="/category/"], .topic-tag, [class*="topic"] a, [class*="Tag"]'
      )
      .forEach((a) => {
        const t = a.textContent.trim();
        if (t && t.length < 30 && !t.toLowerCase().includes("geeks") && !t.toLowerCase().includes("submit")) {
          topics.add(t);
        }
      });

    if (topics.size > 0) return Array.from(topics);

    // 2. Fallback: Infer topic from problem slug / title keywords
    const text = (getSlug() + " " + getTitle()).toLowerCase();
    if (text.includes("array") || text.includes("elements") || text.includes("subarray")) topics.add("Arrays");
    else if (text.includes("string") || text.includes("palindrome") || text.includes("anagram")) topics.add("Strings");
    else if (text.includes("linked-list") || text.includes("linkedlist") || text.includes("node")) topics.add("Linked List");
    else if (text.includes("tree") || text.includes("bst") || text.includes("binary")) topics.add("Trees");
    else if (text.includes("graph") || text.includes("bfs") || text.includes("dfs")) topics.add("Graph");
    else if (text.includes("dp") || text.includes("dynamic") || text.includes("knapsack")) topics.add("Dynamic Programming");
    else if (text.includes("stack") || text.includes("queue")) topics.add("Stack & Queue");
    else if (text.includes("matrix")) topics.add("Matrix");
    else if (text.includes("sort") || text.includes("search")) topics.add("Sorting & Searching");
    else if (text.includes("math") || text.includes("sum") || text.includes("prime") || text.includes("number")) topics.add("Mathematical");

    return topics.size > 0 ? Array.from(topics) : ["Arrays"];
  }

  const LANGUAGE_MAP = {
    "c++": "c++",
    cpp: "c++",
    java: "java",
    python: "python",
    python3: "python3",
    javascript: "javascript",
    js: "javascript",
    "c#": "c#",
    c: "c",
    pypy3: "python3",
  };

  function getLanguage() {
    const langEls = document.querySelectorAll(
      "[class*='language'], [class*='lang-select'], .select-language, button[class*='lang']"
    );
    for (const el of langEls) {
      const text = (el.value || el.textContent || "").trim().toLowerCase();
      for (const [key, val] of Object.entries(LANGUAGE_MAP)) {
        if (text.includes(key)) return val;
      }
    }
    return "plaintext";
  }

  function getCode() {
    // 1. Monaco Editor DOM extraction (most common on modern GFG)
    const monacoLines = document.querySelectorAll(".monaco-editor .view-line");
    if (monacoLines && monacoLines.length > 0) {
      const code = Array.from(monacoLines)
        .map((line) => line.textContent.replace(/\u00a0/g, " "))
        .join("\n");
      if (code.trim()) return code;
    }

    // 2. Ace Editor DOM extraction
    const aceLines = document.querySelectorAll(".ace_line");
    if (aceLines && aceLines.length > 0) {
      const code = Array.from(aceLines)
        .map((line) => line.textContent)
        .join("\n");
      if (code.trim()) return code;
    }

    // 3. CodeMirror DOM extraction
    const cmLines = document.querySelectorAll(".CodeMirror-line");
    if (cmLines && cmLines.length > 0) {
      const code = Array.from(cmLines)
        .map((line) => line.textContent)
        .join("\n");
      if (code.trim()) return code;
    }

    // 4. Monaco/Ace/CodeMirror JS instance access (if available)
    try {
      if (window.monaco && window.monaco.editor) {
        const models = window.monaco.editor.getModels();
        if (models && models.length) return models[0].getValue();
      }
    } catch (e) {}

    try {
      const cmEl = document.querySelector(".CodeMirror");
      if (cmEl && cmEl.CodeMirror) return cmEl.CodeMirror.getValue();
    } catch (e) {}

    try {
      if (window.ace) {
        const aceEditor = window.ace.edit(document.querySelector(".ace_editor"));
        if (aceEditor) return aceEditor.getValue();
      }
    } catch (e) {}

    // 5. Fallback: textareas / inputs
    const textareas = document.querySelectorAll("textarea");
    for (const ta of textareas) {
      if (ta.value && ta.value.trim().length > 15) {
        return ta.value;
      }
    }

    return null;
  }

  function getDescription() {
    const el =
      document.querySelector(".problem-statement") ||
      document.querySelector(".problem-description") ||
      document.querySelector("[class*='problem_content']");
    if (!el) return "";

    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, style, button, input, textarea, svg, img").forEach((n) => n.remove());

    // Convert superscripts (e.g., 10^5) and subscripts
    clone.querySelectorAll("sup").forEach((sup) => sup.replaceWith(`^${sup.textContent.trim()}`));
    clone.querySelectorAll("sub").forEach((sub) => sub.replaceWith(`_${sub.textContent.trim()}`));

    // Convert code tags
    clone.querySelectorAll("code").forEach((c) => c.replaceWith(` \`${c.textContent.trim()}\` `));

    // Convert bold tags cleanly without breaking section headers
    clone.querySelectorAll("strong, b").forEach((b) => {
      const txt = b.textContent.trim();
      if (!txt) return;
      if (/^(Examples?:?|Constraints?:?|Input:?|Output:?|Explanation:?)$/i.test(txt)) {
        b.replaceWith(`\n${txt}\n`);
      } else {
        b.replaceWith(` **${txt}** `);
      }
    });

    // Add newlines around block containers
    clone.querySelectorAll("p, div, br, section, li").forEach((block) => {
      block.prepend(document.createTextNode("\n"));
      block.append(document.createTextNode("\n"));
    });

    let rawText = clone.textContent || "";
    let formatted = rawText
      .replace(/\r\n/g, "\n")
      .replace(/\*\*\s*\n/g, "\n")
      .replace(/\n\s*\*\*/g, "\n")
      .replace(/\*\*\s*\*\*/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    formatted = formatted
      .replace(/^(Examples?:?\s*)$/gim, "\nExamples:\n")
      .replace(/^(Constraints?:?\s*)$/gim, "\nConstraints:\n")
      .replace(/^(Input:?\s*)/gim, "\nInput: ")
      .replace(/^(Output:?\s*)/gim, "\nOutput: ")
      .replace(/^(Explanation:?\s*)/gim, "\nExplanation:\n");

    formatted = formatted.replace(/\n{3,}/g, "\n\n").trim();
    return formatted.length > 20 ? formatted : "";
  }

  function sendAccepted() {
    const payload = {
      platform: "geeksforgeeks",
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

    console.log("[Solve & Organize] Detected success! Sending payload to background worker:", payload);

    chrome.runtime.sendMessage({ type: "SUBMISSION_ACCEPTED", data: payload }, (response) => {
      console.log("[Solve & Organize] Background worker response:", response);
      void chrome.runtime.lastError;
    });
  }

  function isAcceptedSubmission(bodyText) {
    // 1. If any failure message is visible in the result container/modal, reject immediately
    if (FAILURE_PATTERNS.some((pattern) => pattern.test(bodyText))) {
      return false;
    }

    // 2. Check for explicit success text
    if (STRICT_SUCCESS_PATTERNS.some((pattern) => pattern.test(bodyText))) {
      return true;
    }

    // 3. Check for matching test cases count (e.g. "111/111" or "Passed: 50 / 50")
    const match = bodyText.match(/(\d+)\s*\/\s*(\d+)\s*(?:test\s*cases?|passed|points)?/i);
    if (match && match[1] && match[2] && match[1] === match[2] && parseInt(match[1]) > 0) {
      return true;
    }

    return false;
  }

  const observer = new MutationObserver(() => {
    if (notified) return;
    const resultEl =
      document.querySelector("[class*='result'], [class*='Result'], [class*='submission']") || document.body;
    const text = resultEl ? resultEl.innerText : "";

    if (isAcceptedSubmission(text)) {
      notified = true;
      console.log("[Solve & Organize] Verified ACCEPTED submission on GFG!");
      setTimeout(sendAccepted, 700);
    }
  });

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

  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
