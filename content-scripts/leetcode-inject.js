// Runs in the PAGE's own JS context (world: "MAIN") so it can see LeetCode's
// network calls (fetch/XHR), Monaco editor instances, and DOM state.
// Relays accepted solutions via window.postMessage to leetcode-bridge.js.

(function () {
  if (window.__lcOrganizerInstalled) return;
  window.__lcOrganizerInstalled = true;

  let currentSlug = getSlugFromUrl();
  let isHandlingSubmission = false;
  let lastAcceptedTime = 0;

  // SPA navigation tracking (pushState / replaceState / popstate)
  function handleUrlChange() {
    const newSlug = getSlugFromUrl();
    if (newSlug !== currentSlug) {
      currentSlug = newSlug;
      isHandlingSubmission = false;
    }
  }

  const origPushState = history.pushState;
  history.pushState = function (...args) {
    const res = origPushState.apply(this, args);
    handleUrlChange();
    return res;
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function (...args) {
    const res = origReplaceState.apply(this, args);
    handleUrlChange();
    return res;
  };

  window.addEventListener("popstate", handleUrlChange);

  // 1. Network Interception: Fetch
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) || "";

      // REST Polling Endpoint
      if (url.includes("/submissions/detail/") && url.includes("/check/")) {
        response
          .clone()
          .json()
          .then((data) => {
            if (data && (data.status_msg === "Accepted" || data.status_code === 10)) {
              handleAccepted({
                runtime: data.status_runtime,
                memory: data.status_memory,
                lang: data.lang,
                code: data.code,
              });
            }
          })
          .catch(() => {});
      }

      // GraphQL Submissions & Progress
      if (url.includes("/graphql")) {
        const reqBody = args[1] && args[1].body ? String(args[1].body) : "";
        if (
          reqBody.includes("submission") ||
          reqBody.includes("submitCode") ||
          reqBody.includes("checkSubmissionStatus") ||
          reqBody.includes("submissionDetails")
        ) {
          response
            .clone()
            .json()
            .then((res) => {
              const sub =
                res?.data?.submissionDetails ||
                res?.data?.submissionStatus ||
                res?.data?.submitCode ||
                res?.data?.userSubmission;
              if (
                sub &&
                (sub.statusDisplay === "Accepted" ||
                  sub.status_msg === "Accepted" ||
                  sub.statusCode === 10)
              ) {
                handleAccepted({
                  runtime: sub.runtimeDisplay || sub.status_runtime,
                  memory: sub.memoryDisplay || sub.status_memory,
                  lang: sub.lang?.name || sub.lang,
                  code: sub.code,
                });
              }
            })
            .catch(() => {});
        }
      }
    } catch (e) {
      /* non-fatal — never break page network calls */
    }
    return response;
  };

  // 2. Network Interception: XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._reqUrl = url || "";
    return origOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        const url = this._reqUrl || "";
        if (url.includes("/submissions/detail/") && url.includes("/check/")) {
          const data = JSON.parse(this.responseText);
          if (data && (data.status_msg === "Accepted" || data.status_code === 10)) {
            handleAccepted({
              runtime: data.status_runtime,
              memory: data.status_memory,
              lang: data.lang,
              code: data.code,
            });
          }
        }
      } catch (e) {}
    });
    return origSend.apply(this, args);
  };

  // 3. DOM MutationObserver Backup: Detects "Accepted" banner on DOM directly
  const domObserver = new MutationObserver(() => {
    if (isHandlingSubmission || Date.now() - lastAcceptedTime < 5000) return;

    const resultBanner =
      document.querySelector('[data-e2e-locator="submission-result"]') ||
      document.querySelector('span[data-e2e-locator="submission-result"]') ||
      document.querySelector('div[class*="result"]') ||
      document.querySelector('div[class*="text-green"]');

    if (resultBanner && resultBanner.textContent && resultBanner.textContent.trim().toLowerCase() === "accepted") {
      handleAccepted();
    }
  });

  domObserver.observe(document.documentElement, { childList: true, subtree: true });

  function getTitle() {
    const el =
      document.querySelector('[data-cy="question-title"]') ||
      document.querySelector("div.mr-2.text-label-1 a") ||
      document.querySelector("a[href*='/problems/'] > div") ||
      document.querySelector("div[class*='text-title-large']");
    if (el && el.textContent.trim()) return el.textContent.trim();
    return document.title.replace(/\s*-\s*LeetCode\s*$/i, "").trim();
  }

  function getSlugFromUrl() {
    const m = window.location.pathname.match(/\/problems\/([^/?#]+)/);
    return m ? m[1] : "unknown-problem";
  }

  function getDifficulty() {
    const nodes = document.querySelectorAll("div, span");
    for (const el of nodes) {
      if (el.children.length) continue;
      const t = el.textContent.trim();
      if (t === "Easy" || t === "Medium" || t === "Hard") return t;
    }
    return "Unknown";
  }

  function getTopics() {
    const topics = new Set();
    document.querySelectorAll('a[href*="/tag/"]').forEach((a) => {
      const t = a.textContent.trim();
      if (t) topics.add(t);
    });
    return Array.from(topics);
  }

  const LANGUAGE_LABELS = [
    "C++", "Java", "Python3", "Python", "C#", "JavaScript", "TypeScript",
    "PHP", "Swift", "Kotlin", "Dart", "Go", "Ruby", "Scala", "Rust",
    "Racket", "Erlang", "Elixir", "C",
  ];

  function getLanguage(fallbackLang) {
    if (fallbackLang) return fallbackLang;
    const candidates = Array.from(document.querySelectorAll("button, div, span")).filter(
      (el) => el.children.length === 0 && LANGUAGE_LABELS.includes(el.textContent.trim())
    );
    if (candidates.length) return candidates[0].textContent.trim();
    return "plaintext";
  }

  function getCode(fallbackCode) {
    if (fallbackCode && fallbackCode.trim()) return fallbackCode;

    // 1. Monaco Editor Models
    try {
      if (window.monaco && window.monaco.editor) {
        const models = window.monaco.editor.getModels();
        if (models && models.length) {
          const mainModel = models.find((m) => m.getValue().trim().length > 10) || models[0];
          const val = mainModel.getValue();
          if (val && val.trim()) return val;
        }
      }
    } catch (e) {}

    // 2. Monaco Editor View Lines DOM
    const monacoLines = document.querySelectorAll(".monaco-editor .view-line");
    if (monacoLines && monacoLines.length > 0) {
      const code = Array.from(monacoLines)
        .map((l) => l.textContent.replace(/\u00a0/g, " "))
        .join("\n");
      if (code.trim().length > 5) return code;
    }

    // 3. CodeMirror
    try {
      const cmEl = document.querySelector(".CodeMirror");
      if (cmEl && cmEl.CodeMirror) {
        const val = cmEl.CodeMirror.getValue();
        if (val && val.trim()) return val;
      }
    } catch (e) {}

    return null;
  }

  function getDescription() {
    const el =
      document.querySelector('[data-track-load="description_content"]') ||
      document.querySelector('div[class*="elfjS"]') ||
      document.querySelector('.description__2b0f') ||
      document.querySelector('div[data-key="description-content"]');
    if (!el) return "";

    const clone = el.cloneNode(true);
    clone.querySelectorAll("script, style, button, input, svg, img").forEach((n) => n.remove());

    clone.querySelectorAll("sup").forEach((sup) => sup.replaceWith(`^${sup.textContent.trim()}`));
    clone.querySelectorAll("sub").forEach((sub) => sub.replaceWith(`_${sub.textContent.trim()}`));

    clone.querySelectorAll("code").forEach((c) => c.replaceWith(` \`${c.textContent.trim()}\` `));
    clone.querySelectorAll("strong, b").forEach((b) => {
      const txt = b.textContent.trim();
      if (!txt) return;
      if (/^(Examples?:?|Constraints?:?|Input:?|Output:?|Explanation:?)$/i.test(txt)) {
        b.replaceWith(`\n${txt}\n`);
      } else {
        b.replaceWith(` **${txt}** `);
      }
    });

    clone.querySelectorAll("p, div, br, section, li, pre").forEach((block) => {
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

  function handleAccepted(extraData = {}) {
    if (isHandlingSubmission) return;
    const now = Date.now();
    if (now - lastAcceptedTime < 4000) return;

    isHandlingSubmission = true;
    lastAcceptedTime = now;

    // Small delay so DOM and editor settle after judging completes
    setTimeout(() => {
      const payload = {
        platform: "leetcode",
        slug: getSlugFromUrl(),
        title: getTitle(),
        difficulty: getDifficulty(),
        topics: getTopics(),
        language: getLanguage(extraData.lang),
        code: getCode(extraData.code),
        description: getDescription(),
        runtime: extraData.runtime,
        memory: extraData.memory,
        url: window.location.href,
        solvedAt: new Date().toISOString(),
      };

      window.postMessage(
        { source: "lc-organizer-extension", payload },
        window.location.origin
      );

      // Reset submission flag after 3.5 seconds
      setTimeout(() => {
        isHandlingSubmission = false;
      }, 3500);
    }, 700);
  }
})();
