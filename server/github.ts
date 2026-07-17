import { HttpError } from "./http.js";

/**
 * Thin GitHub API client for the New Session flow, authenticated with the
 * same PAT sessions use for clone/push. Listing works with any token that
 * can read the repos; creating needs classic `repo` scope or fine-grained
 * "Administration: write".
 */

function headers(token: string): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "grotto",
    "x-github-api-version": "2022-11-28",
  };
}

let cache: { at: number; repos: string[] } | null = null;

/** Repos the token can reach, most recently pushed first. Cached ~5 min. */
export async function listGithubRepos(token: string): Promise<string[]> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.repos;
  const repos: string[] = [];
  for (let page = 1; page <= 3; page++) {
    const res = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=pushed&page=${page}`,
      { headers: headers(token) },
    );
    if (!res.ok) throw new HttpError(502, `GitHub API ${res.status}`);
    const batch = (await res.json()) as Array<{ full_name?: string }>;
    repos.push(...batch.map((r) => r.full_name).filter((n): n is string => !!n));
    if (batch.length < 100) break;
  }
  cache = { at: Date.now(), repos };
  return repos;
}

/** Create a repo in the token owner's account. auto_init gives it an initial
 *  commit on the default branch, so the follow-up clone behaves normally. */
export async function createGithubRepo(
  token: string,
  name: string,
  isPrivate: boolean,
): Promise<string> {
  const res = await fetch("https://api.github.com/user/repos", {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ name, private: isPrivate, auto_init: true }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    full_name?: string;
    message?: string;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok) {
    const detail = data.errors?.[0]?.message ?? data.message ?? `GitHub API ${res.status}`;
    if (res.status === 422) throw new HttpError(409, `GitHub: ${detail}`);
    if (res.status === 403) {
      throw new HttpError(
        403,
        `GitHub: ${detail} — creating repos needs classic "repo" scope or fine-grained "Administration: write"`,
      );
    }
    throw new HttpError(502, `GitHub: ${detail}`);
  }
  if (!data.full_name) throw new HttpError(502, "GitHub: no repo name in response");
  cache = null; // the new repo should appear in the next listing
  return data.full_name;
}
