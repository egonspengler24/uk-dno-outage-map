// Cloudflare Worker that starts the "Update outages" GitHub Actions workflow
// on a schedule. GitHub's own cron trigger is best-effort and was not firing
// for this repo, so Cloudflare's cron does the timing instead.
//
// Needs the GITHUB_TOKEN secret: a fine-grained personal access token
// limited to this repository with "Actions: Read and write" permission.
// The Worker exposes no way to trigger a run over HTTP.

async function dispatchWorkflow(env) {
  const url = `https://api.github.com/repos/${env.GITHUB_REPO}/actions/workflows/${env.WORKFLOW_FILE}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "uk-dno-outage-refresh-worker",
    },
    body: JSON.stringify({ ref: env.GIT_REF }),
  });

  // GitHub returns 204 No Content on success.
  if (res.status !== 204) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Workflow dispatch failed: HTTP ${res.status} ${body}`);
  }
  console.log(`Dispatched ${env.WORKFLOW_FILE} on ${env.GITHUB_REPO}@${env.GIT_REF}`);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatchWorkflow(env));
  },

  async fetch() {
    return new Response("UK DNO outage map refresher. Runs on a schedule; nothing to see here.\n", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
