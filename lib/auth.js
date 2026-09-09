// GitHub Authentication & Profile Utilities

/**
 * Fetches authenticated user's profile details from GitHub.
 * @param {string} token
 * @returns {Promise<{login: string, name: string, avatar_url: string, html_url: string}>}
 */
export async function fetchUserProfile(token) {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Invalid or expired token (401 Unauthorized)");
    }
    throw new Error(`Failed to fetch user profile (${res.status})`);
  }

  return res.json();
}

/**
 * Fetches the user's accessible repositories.
 * @param {string} token
 * @returns {Promise<Array<{name: string, full_name: string, default_branch: string, private: boolean}>>}
 */
export async function fetchUserRepos(token) {
  const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) return [];
  const repos = await res.json();
  return Array.isArray(repos) ? repos : [];
}
