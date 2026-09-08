// GitHub OAuth Device Authorization Flow (RFC 8628)
// Enables 1-click authentication directly from the extension without manual PAT extraction.

// Standard GitHub OAuth App Client ID for Solve & Organize extension
export const DEFAULT_CLIENT_ID = "Ov23liauK8x7eYx09x1B"; // Fallback / configurable

/**
 * Initiates the Device Flow with GitHub.
 * @param {string} clientId
 * @returns {Promise<{device_code: string, user_code: string, verification_uri: string, expires_in: number, interval: number}>}
 */
export async function startDeviceFlow(clientId = DEFAULT_CLIENT_ID) {
  const res = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      scope: "repo read:user user:email",
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to initiate GitHub device login (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`GitHub Device Flow error: ${data.error_description || data.error}`);
  }

  return data;
}

/**
 * Polls GitHub until the user authorizes the device code or it expires.
 * @param {string} clientId
 * @param {string} deviceCode
 * @param {number} intervalSeconds
 * @param {function(string): void} onStatus
 * @returns {Promise<{accessToken: string, scope: string}>}
 */
export async function pollDeviceToken(clientId, deviceCode, intervalSeconds = 5, onStatus = () => {}) {
  let pollInterval = (intervalSeconds || 5) * 1000;
  let isPolling = true;

  return new Promise((resolve, reject) => {
    async function check() {
      if (!isPolling) return;
      try {
        const res = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            device_code: deviceCode,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        });

        const data = await res.json();

        if (data.access_token) {
          isPolling = false;
          onStatus("Authorized! Connecting...");
          resolve({
            accessToken: data.access_token,
            scope: data.scope,
          });
          return;
        }

        if (data.error === "authorization_pending") {
          onStatus("Waiting for confirmation on GitHub...");
          setTimeout(check, pollInterval);
        } else if (data.error === "slow_down") {
          pollInterval += 5000;
          onStatus("Adjusting polling speed...");
          setTimeout(check, pollInterval);
        } else if (data.error === "expired_token") {
          isPolling = false;
          reject(new Error("Device code expired. Please click 'Sign in with GitHub' again."));
        } else if (data.error === "access_denied") {
          isPolling = false;
          reject(new Error("Authorization was cancelled."));
        } else {
          isPolling = false;
          reject(new Error(data.error_description || data.error || "Authentication failed."));
        }
      } catch (err) {
        // Transient network error, retry next cycle
        setTimeout(check, pollInterval);
      }
    }

    setTimeout(check, pollInterval);
  });
}

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
