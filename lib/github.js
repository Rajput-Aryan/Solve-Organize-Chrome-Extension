// Thin wrapper around the GitHub Contents API. Used by both the background
// service worker (to push solutions) and the popup (to read the index for
// topic filtering).

const API = "https://api.github.com";

function b64EncodeUnicode(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(escape(atob(str)));
}

async function ghFetch(settings, path, options = {}) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${settings.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
}

export async function testConnection(settings) {
  const userRes = await ghFetch(settings, "/user");
  if (!userRes.ok) throw new Error(`Token check failed (${userRes.status}). Check your Personal Access Token.`);
  const repoRes = await ghFetch(settings, `/repos/${settings.owner}/${settings.repo}`);
  if (!repoRes.ok) throw new Error(`Repo check failed (${repoRes.status}). Check owner/repo and that the token has access.`);
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
  const res = await ghFetch(settings, `/repos/${settings.owner}/${settings.repo}/contents/${encodeURI(filePath)}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${filePath} failed: ${res.status} ${await res.text()}`);
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

export function buildPaths(settings, data) {
  const platformFolder = getPlatformFolder(data.platform);
  const topicFolder =
    settings.groupByTopic !== false && data.topics && data.topics.length ? slugify(data.topics[0]) : "Misc";
  
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
