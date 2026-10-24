const API = 'https://api.github.com';

export function makeGitHub({ token, owner, repo }) {
  const headers = () => ({
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });

  async function rest(path, opts = {}) {
    const res = await fetch(`${API}${path}`, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitHub ${opts.method || 'GET'} ${path} -> ${res.status}: ${body}`);
    }
    return res.status === 204 ? null : res.json();
  }

  const json = (method, body) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  async function paged(path) {
    const all = [];
    for (let page = 1; page <= 10; page += 1) {
      const sep = path.includes('?') ? '&' : '?';
      const batch = await rest(`${path}${sep}per_page=100&page=${page}`);
      all.push(...batch);
      if (batch.length < 100) break;
    }
    return all;
  }

  const r = `/repos/${owner}/${repo}`;
  return {
    getIssue: (n) => rest(`${r}/issues/${n}`),
    getPR: (n) => rest(`${r}/pulls/${n}`),
    listPRFiles: (n) => paged(`${r}/pulls/${n}/files`),
    listComments: (n) => paged(`${r}/issues/${n}/comments`),
    listIssueEvents: (n) => paged(`${r}/issues/${n}/events`),
    listOpenPRs: () => paged(`${r}/pulls?state=open`),
    async listIssuesByLabel(label, state = 'open') {
      const items = await paged(`${r}/issues?state=${state}&labels=${encodeURIComponent(label)}&sort=created&direction=desc`);
      return items.filter((i) => !i.pull_request);
    },

    postComment: (n, body) => rest(`${r}/issues/${n}/comments`, json('POST', { body })),
    updateComment: (id, body) => rest(`${r}/issues/comments/${id}`, json('PATCH', { body })),
    addLabels: (n, labels) => rest(`${r}/issues/${n}/labels`, json('POST', { labels })),
    async removeLabel(n, name) {
      try {
        await rest(`${r}/issues/${n}/labels/${encodeURIComponent(name)}`, { method: 'DELETE' });
      } catch (err) {
        if (!String(err.message).includes('404')) throw err; // already gone
      }
    },
    createIssue: ({ title, body, labels }) => rest(`${r}/issues`, json('POST', { title, body, labels })),
    setStatus: (sha, state, description, targetUrl) =>
      rest(`${r}/statuses/${sha}`, json('POST', {
        state,
        context: 'product-owner',
        description: String(description).slice(0, 140),
        ...(targetUrl ? { target_url: targetUrl } : {}),
      })),

    async ensureLabel(name, color, description) {
      try {
        await rest(`${r}/labels`, json('POST', { name, color, description }));
      } catch (err) {
        if (!String(err.message).includes('422')) throw err; // 422 = already exists
      }
    },
  };
}
