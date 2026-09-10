// Thin wrapper around the GitHub Contents & Repos API. Used by both the background
// service worker (to push solutions) and the popup (to verify connections and read index).

const API = "https://api.github.com";

function b64EncodeUnicode(str) {
  try {
    return btoa(unescape(encodeURIComponent(str || "")));
  } catch (e) {
    // Fallback for tricky unicode strings
    const bytes = new TextEncoder().encode(str || "");
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}

function b64DecodeUnicode(str) {
  try {
    return decodeURIComponent(escape(atob(str || "")));
  } catch (e) {
    const binary = atob(str || "");
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
}

export async function ghFetch(settings, path, options = {}) {
  const token = (settings.token || "").trim();
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
}

/**
 * Creates a repository on GitHub under the authenticated user's account.
 */
export async function createRepo(settings, isPrivate = false) {
  const repoName = (settings.repo || "").trim();
  if (!repoName) throw new Error("Repository name cannot be empty.");

  const res = await ghFetch(settings, "/user/repos", {
    method: "POST",
    body: JSON.stringify({
      name: repoName,
      description: "Competitive programming & DSA solutions automatically synced by Solve & Organize.",
      private: isPrivate,
      auto_init: true, // Creates default README and initial commit so 'main' branch exists
    }),
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.message || `Failed to create repository (${res.status})`);
  }

  return res.json();
}

/**
 * Tests GitHub connection, validates token scopes, and checks repository access.
 */
export async function testConnection(settings) {
  if (!settings.token) {
    throw new Error("No token provided. Please enter your GitHub Personal Access Token.");
  }
  if (!settings.owner || !settings.repo) {
    throw new Error("Please provide both Repo owner and Repo name.");
  }

  const userRes = await ghFetch(settings, "/user");
  if (!userRes.ok) {
    if (userRes.status === 401) {
      throw new Error("Token check failed (401 Unauthorized). Your token may be invalid, revoked, or expired.");
    }
    throw new Error(`Token check failed (${userRes.status}). Check your Personal Access Token.`);
  }

  // Verify OAuth / PAT scopes if returned
  const scopesHeader = userRes.headers.get("x-oauth-scopes") || userRes.headers.get("X-OAuth-Scopes");
  if (scopesHeader !== null) {
    const scopes = scopesHeader.split(",").map((s) => s.trim());
    if (!scopes.includes("repo") && !scopes.includes("public_repo")) {
      throw new Error("Token is missing the 'repo' scope! Please generate a token with 'repo' checkbox enabled.");
    }
  }

  const repoRes = await ghFetch(settings, `/repos/${settings.owner}/${settings.repo}`);
  if (!repoRes.ok) {
    if (repoRes.status === 404) {
      const err = new Error(`Repository '${settings.owner}/${settings.repo}' not found on GitHub.`);
      err.repoNotFound = true;
      throw err;
    }
    if (repoRes.status === 403) {
      throw new Error(`Access forbidden (403). Your token does not have write access to '${settings.owner}/${settings.repo}'.`);
    }
    throw new Error(`Repo check failed (${repoRes.status}). Check owner/repo and permissions.`);
  }

  const user = await userRes.json();
  return { login: user.login };
}

export async function getFile(settings, filePath) {
  const res = await ghFetch(
    settings,
    `/repos/${settings.owner}/${settings.repo}/contents/${encodeURI(filePath)}?ref=${settings.branch || "main"}`
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${filePath} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function putFile(settings, filePath, contentStr, message, sha) {
  const body = {
    message,
    content: b64EncodeUnicode(contentStr),
    branch: settings.branch || "main",
  };
  if (sha) body.sha = sha;

  let res = await ghFetch(settings, `/repos/${settings.owner}/${settings.repo}/contents/${encodeURI(filePath)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  // If branch reference does not exist or repo is empty, retry without explicit branch param
  if (!res.ok && (res.status === 404 || res.status === 409)) {
    const errText = await res.text();
    if (errText.includes("empty") || errText.includes("branch") || errText.includes("Reference")) {
      delete body.branch;
      res = await ghFetch(settings, `/repos/${settings.owner}/${settings.repo}/contents/${encodeURI(filePath)}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    }
    if (!res.ok) throw new Error(`GitHub PUT ${filePath} failed: ${res.status} ${errText}`);
  } else if (!res.ok) {
    throw new Error(`GitHub PUT ${filePath} failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

const EXT_MAP = {
  python3: "py", python: "py", java: "java", "c++": "cpp", c: "c", "c#": "cs",
  javascript: "js", typescript: "ts", go: "go", kotlin: "kt", swift: "swift",
  rust: "rs", php: "php", ruby: "rb", scala: "scala", dart: "dart",
  racket: "rkt", erlang: "erl", elixir: "ex", plaintext: "txt",
};

export function slugify(t) {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "misc";
}

const PLATFORM_MAP = {
  leetcode: "LeetCode",
  hackerrank: "HackerRank",
  geeksforgeeks: "GeeksforGeeks",
  codeforces: "Codeforces",
  codechef: "CodeChef",
  atcoder: "AtCoder",
  neetcode: "NeetCode",
};

export function getPlatformFolder(platform) {
  return PLATFORM_MAP[(platform || "").toLowerCase()] || platform || "Other";
}

export function formatDifficulty(diff) {
  if (!diff) return "Unrated";
  const d = String(diff).trim();
  const lower = d.toLowerCase();
  if (lower === "school") return "School";
  if (lower === "basic") return "Basic";
  if (lower === "easy") return "Easy";
  if (lower === "medium") return "Medium";
  if (lower === "hard") return "Hard";
  if (/^\d+$/.test(d)) return `Rating-${d}`;
  return d.charAt(0).toUpperCase() + d.slice(1);
}

export function inferTopic(slug = "", title = "", description = "") {
  const combined = `${slug} ${title} ${description}`.toLowerCase();

  // 1. Strings (Checked first to avoid misclassifying chars/words as elements)
  if (/(string|strings|char|chars|character|characters|palindrome|anagram|substring|subsequence|prefix|suffix|parenthes|roman|vowel|consonant|isomorphic|word|words|valid-palindrome|haystack|needle)/i.test(combined)) {
    return "Strings";
  }

  // 2. Linked List
  if (/(linked[\s-]?list|listnode|singly|doubly|reverse-linked-list|detect-cycle|middle-of-linked-list)/i.test(combined)) {
    return "Linked List";
  }

  // 3. Trees & Binary Trees
  if (/(tree|trees|bst|trie|binary[\s-]?tree|binary-search-tree|inorder|preorder|postorder|level-order|lca|lowest-common-ancestor|segment-tree)/i.test(combined)) {
    return "Trees";
  }

  // 4. Dynamic Programming
  if (/(dynamic[\s-]?programming|dp\b|knapsack|coin-change|climbing-stairs|fibonacci|edit-distance|longest-increasing-subsequence|lcs\b|lis\b)/i.test(combined)) {
    return "Dynamic Programming";
  }

  // 5. Graph
  if (/(graph|graphs|bfs\b|dfs\b|dijkstra|bellman|floyd|topological|bipartite|shortest-path|connected-components|island|islands)/i.test(combined)) {
    return "Graph";
  }

  // 6. Stack & Queue
  if (/(stack|stacks|queue|queues|deque|monotonic-stack|next-greater)/i.test(combined)) {
    return "Stack & Queue";
  }

  // 7. Binary Search / Sorting
  if (/(binary[\s-]?search|sorting|quicksort|mergesort|heapsort|median|kth-largest|kth-smallest)/i.test(combined)) {
    return "Sorting & Searching";
  }

  // 8. Matrix
  if (/(matrix|matrices|grid|2d[\s-]?array|spiral-matrix|rotate-image|flood-fill)/i.test(combined)) {
    return "Matrix";
  }

  // 9. Hash Table
  if (/(hash[\s-]?table|hashmap|hashset|frequency-map|two-sum|contains-duplicate)/i.test(combined)) {
    return "Hash Table";
  }

  // 10. Arrays (Strict checks so random words aren't captured)
  if (/(\barray\b|\barrays\b|subarray|subarrays|two[\s-]?pointer|two[\s-]?pointers|sliding[\s-]?window|rotate-array|majority-element|merge-sorted-array)/i.test(combined)) {
    return "Arrays";
  }

  // 11. Math & Bit Manipulation
  if (/(math|mathematical|prime|primes|gcd|lcm|factorial|power[\s-]?of|divisor|bitwise|bit[\s-]?manipulation|count-bits)/i.test(combined)) {
    return "Mathematical";
  }

  // 12. Backtracking
  if (/(backtrack|backtracking|permutation|permutations|combination|combinations|n[\s-]?queens|subsets)/i.test(combined)) {
    return "Backtracking";
  }

  // 13. Greedy
  if (/(greedy|interval|intervals|activity-selection|meeting-rooms|gas-station)/i.test(combined)) {
    return "Greedy";
  }

  return "Algorithms";
}

export function resolveTopic(data) {
  if (data.topics && Array.isArray(data.topics) && data.topics.length > 0) {
    const valid = data.topics.filter(
      (t) => t && typeof t === "string" && !/^(submit|geeks|problem|practice|all|tags|tag|misc|algorithms)$/i.test(t.trim())
    );
    if (valid.length > 0) {
      const top = valid[0].trim();
      if (/^string/i.test(top)) return "Strings";
      if (/^array/i.test(top)) return "Arrays";
      if (/^tree/i.test(top)) return "Trees";
      if (/^dynamic/i.test(top) || /^dp/i.test(top)) return "Dynamic Programming";
      if (/^graph/i.test(top)) return "Graph";
      if (/^link/i.test(top)) return "Linked List";
      if (/^stack|^queue/i.test(top)) return "Stack & Queue";
      if (/^hash/i.test(top)) return "Hash Table";
      if (/^math/i.test(top)) return "Mathematical";
      if (/^sort|^search/i.test(top)) return "Sorting & Searching";
      return top.charAt(0).toUpperCase() + top.slice(1);
    }
  }

  return inferTopic(data.slug || "", data.title || "", data.description || "");
}

export function buildPaths(settings, data) {
  const platformFolder = getPlatformFolder(data.platform);
  const resolvedTopicName = resolveTopic(data);
  const topicFolder = settings.groupByTopic !== false ? slugify(resolvedTopicName) : "Misc";
  
  const diffFolder =
    settings.groupByDifficulty !== false && data.difficulty
      ? formatDifficulty(data.difficulty)
      : null;

  const nameFolder = data.slug || slugify(data.title || "problem");
  
  const base = diffFolder
    ? `${platformFolder}/${topicFolder}/${diffFolder}/${nameFolder}`
    : `${platformFolder}/${topicFolder}/${nameFolder}`;

  const ext = EXT_MAP[(data.language || "").toLowerCase()] || "txt";
  return {
    base,
    solutionPath: `${base}/solution.${ext}`,
    readmePath: `${base}/README.md`,
  };
}

export function buildReadme(data) {
  const platformName = getPlatformFolder(data.platform);

  const diffLower = (data.difficulty || "").toLowerCase();
  const diffColor =
    diffLower === "easy" || diffLower === "school" || diffLower === "basic" || diffLower === "800" || diffLower === "900" || diffLower === "1000"
      ? "brightgreen"
      : diffLower === "medium" || diffLower === "1100" || diffLower === "1200" || diffLower === "1300" || diffLower === "1400"
      ? "orange"
      : diffLower === "hard" || parseInt(diffLower) >= 1500
      ? "red"
      : "blue";

  const diffBadge = `https://img.shields.io/badge/Difficulty-${encodeURIComponent(data.difficulty || "Unknown")}-${diffColor}.svg`;
  const platformBadge = `https://img.shields.io/badge/Platform-${encodeURIComponent(platformName)}-green.svg`;
  const langBadge = `https://img.shields.io/badge/Language-${encodeURIComponent(data.language || "Unknown")}-blue.svg`;

  const topicsList =
    data.topics && data.topics.length
      ? data.topics.map((t) => `\`${t}\``).join(", ")
      : "`Uncategorized`";

  let cleanDescription = (data.description || "").trim();
  if (cleanDescription) {
    cleanDescription = cleanDescription
      // Remove double emojis if already present
      .replace(/⚡\s*⚡/g, "⚡")
      .replace(/🔒\s*🔒/g, "🔒")
      .replace(/\*\*\s*\n/g, "\n")
      .replace(/\n\s*\*\*/g, "\n")
      .replace(/\*\*\s*\*\*/g, "")
      // Clean up headers without duplicating emojis or leaving colons behind
      .replace(/^(?:###\s*)?(?:⚡\s*)?Examples?:?\s*$/gim, "\n### ⚡ Examples\n")
      .replace(/^(?:####\s*)?(?:⚡\s*)?(Example \d+:?)\s*$/gim, "\n#### $1\n")
      .replace(/^(?:###\s*)?(?:🔒\s*)?Constraints?:?\s*$/gim, "\n### 🔒 Constraints\n")
      .replace(/^(?:\*\*Input:\*\*|Input:)\s*/gim, "**Input:** ")
      .replace(/^(?:\*\*Output:\*\*|Output:)\s*/gim, "**Output:** ")
      .replace(/^(?:\*\*Explanation:\*\*|Explanation:)\s*/gim, "**Explanation:** ")
      .replace(/^(Take \w+ element:)/gim, "- $1")
      .replace(/^(Skip \w+ element:)/gim, "- $1")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const descriptionSection = cleanDescription
    ? `\n---\n\n## 📝 Problem Statement\n\n${cleanDescription}\n`
    : "";

  const solvedTime = data.solvedAt ? new Date(data.solvedAt).toUTCString() : "Recently";

  return `# 🧩 ${data.title || data.slug}

![Platform](${platformBadge}) ![Difficulty](${diffBadge}) ![Language](${langBadge})

| Property | Details |
| :--- | :--- |
| **Platform** | ${platformName} |
| **Difficulty** | ${data.difficulty || "Unknown"} |
| **Topics** | ${topicsList} |
| **Language** | \`${data.language || "Unknown"}\` |
| **Solved At** | ${solvedTime} |
${descriptionSection}
---

## 💡 Solution & Complexity Notes

_Add your approach, complexity analysis, and edge cases here._

- **Time Complexity:** _O(N)_
- **Space Complexity:** _O(1)_

---

🔗 **Direct Link:** [View Problem on ${platformName}](${data.url})
`;
}

export async function getRepoTree(settings) {
  try {
    const branch = settings.branch || "main";
    const res = await ghFetch(
      settings,
      `/repos/${settings.owner}/${settings.repo}/git/trees/${encodeURI(branch)}?recursive=1`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.tree || [];
  } catch (e) {
    return null;
  }
}

export async function checkProblemExists(settings, data) {
  const platformFolder = getPlatformFolder(data.platform);
  const slug = data.slug || slugify(data.title || "problem");

  // 1. Check index.json
  const index = await fetchIndex(settings);
  if (Array.isArray(index) && index.length > 0) {
    const key = `${data.platform}:${slug}`;
    const foundInIndex = index.some((entry) => {
      if (entry.platform && entry.platform.toLowerCase() !== (data.platform || "").toLowerCase()) {
        return false;
      }
      if (entry.key === key || entry.slug === slug) return true;
      if (entry.path) {
        const parts = entry.path.split("/");
        if (parts[0] === platformFolder && parts[parts.length - 1] === slug) {
          return true;
        }
      }
      return false;
    });
    if (foundInIndex) return true;
  }

  // 2. Check repo file tree under platformFolder
  const tree = await getRepoTree(settings);
  if (Array.isArray(tree) && tree.length > 0) {
    const foundInTree = tree.some((item) => {
      const path = item.path || "";
      if (!path.startsWith(`${platformFolder}/`)) return false;
      const parts = path.split("/");
      return parts.includes(slug);
    });
    if (foundInTree) return true;
  }

  // 3. Check direct solution / README paths
  const paths = buildPaths(settings, data);
  const solutionFile = await getFile(settings, paths.solutionPath);
  if (solutionFile) return true;
  const readmeFile = await getFile(settings, paths.readmePath);
  if (readmeFile) return true;

  return false;
}

export async function pushSolution(settings, data) {
  const paths = buildPaths(settings, data);

  // Check if repository exists or auto-create if missing
  try {
    const repoCheck = await ghFetch(settings, `/repos/${settings.owner}/${settings.repo}`);
    if (repoCheck.status === 404) {
      console.log(`[Solve & Organize] Repo '${settings.owner}/${settings.repo}' not found. Attempting auto-creation...`);
      await createRepo(settings, false);
    }
  } catch (e) {
    console.warn("[Solve & Organize] Could not auto-verify/create repo:", e);
  }

  if (settings.onlyAddIfNotExists !== false) {
    const exists = await checkProblemExists(settings, data);
    if (exists) {
      const platformFolder = getPlatformFolder(data.platform);
      return {
        ok: true,
        skipped: true,
        path: paths.base,
        message: `Problem "${data.title || data.slug}" already exists in ${platformFolder}/ folder in repository.`,
      };
    }
  }

  const code = data.code || "// Could not auto-extract source for this submission — paste your solution here.";

  const existingSolution = await getFile(settings, paths.solutionPath);
  await putFile(
    settings,
    paths.solutionPath,
    code,
    `Add/update solution: ${data.title || data.slug}`,
    existingSolution ? existingSolution.sha : undefined
  );

  const existingReadme = await getFile(settings, paths.readmePath);
  await putFile(
    settings,
    paths.readmePath,
    buildReadme(data),
    `Add/update notes: ${data.title || data.slug}`,
    existingReadme ? existingReadme.sha : undefined
  );

  await updateIndex(settings, data, paths);

  return { ok: true, skipped: false, path: paths.base };
}


export async function fetchIndex(settings) {
  const existing = await getFile(settings, "index.json");
  if (!existing || !existing.content) return [];
  try {
    return JSON.parse(b64DecodeUnicode(existing.content.replace(/\n/g, "")));
  } catch (e) {
    return [];
  }
}

export async function updateIndex(settings, data, paths) {
  const existing = await getFile(settings, "index.json");
  let index = [];
  if (existing && existing.content) {
    try {
      index = JSON.parse(b64DecodeUnicode(existing.content.replace(/\n/g, "")));
    } catch (e) {
      index = [];
    }
  }

  const key = `${data.platform}:${data.slug}`;
  const entry = {
    key,
    title: data.title,
    platform: data.platform,
    difficulty: data.difficulty,
    topics: data.topics || [],
    language: data.language,
    solvedAt: data.solvedAt,
    path: paths.base,
    url: data.url,
  };

  const i = index.findIndex((e) => e.key === key);
  if (i >= 0) index[i] = entry;
  else index.push(entry);

  const content = JSON.stringify(index, null, 2);
  await putFile(settings, "index.json", content, `Update index: ${data.title || data.slug}`, existing ? existing.sha : undefined);
}
