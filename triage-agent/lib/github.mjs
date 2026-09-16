const API = 'https://api.github.com';

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function makeGitHub({ token, owner, repo }) {
  async function rest(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { ...authHeaders(token), ...(opts.headers || {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`GitHub ${opts.method || 'GET'} ${path} -> ${res.status}: ${body}`);
    }
    return res.status === 204 ? null : res.json();
  }

  async function graphql(query, variables) {
    const res = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) {
      throw new Error(`GitHub GraphQL error: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  }

  return {
    me: () => rest('/user'),

    async listOpenIssues() {
      const issues = [];
      let page = 1;
      for (;;) {
        const batch = await rest(`/repos/${owner}/${repo}/issues?state=open&per_page=100&page=${page}`);
        issues.push(...batch.filter((i) => !i.pull_request));
        if (batch.length < 100) break;
        page += 1;
      }
      return issues;
    },

    listComments: (issueNumber) => rest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`),

    postComment: (issueNumber, body) =>
      rest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      }),

    setLabels: (issueNumber, labels) =>
      rest(`/repos/${owner}/${repo}/issues/${issueNumber}/labels`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labels }),
      }),

    async ensureLabel(name, color, description) {
      try {
        await rest(`/repos/${owner}/${repo}/labels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, color, description }),
        });
      } catch (err) {
        // 422 = label already exists, which is the expected steady state
        if (!String(err.message).includes('422')) throw err;
      }
    },

    graphql,
  };
}
