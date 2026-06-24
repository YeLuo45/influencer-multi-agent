'use strict';

const els = {
  contentList: document.getElementById('content-list'),
  queueSummary: document.getElementById('queue-summary'),
  queueList: document.getElementById('queue-list'),
  feedbackSummary: document.getElementById('feedback-summary'),
  statsOutput: document.getElementById('stats-output'),
  metricsOutput: document.getElementById('metrics-output'),
  roadmapOutput: document.getElementById('roadmap-output'),
  productionOutput: document.getElementById('production-output'),
  bulkStatus: document.getElementById('bulk-status'),
  bulkPause: document.getElementById('bulk-pause'),
  bulkResume: document.getElementById('bulk-resume'),
  bulkRetry: document.getElementById('bulk-retry'),
  bulkCancel: document.getElementById('bulk-cancel'),
  abContentId: document.getElementById('ab-content-id'),
  abLoad: document.getElementById('ab-load'),
  abOutput: document.getElementById('ab-output'),
  runTopic: document.getElementById('run-topic'),
  runPersona: document.getElementById('run-persona'),
  runSubmit: document.getElementById('run-submit'),
  runOutput: document.getElementById('run-output'),
  queueWork: document.getElementById('queue-work'),
  queueWorkStatus: document.getElementById('queue-work-status'),
  refreshAll: document.getElementById('refresh-all'),
  realtimeStatus: document.getElementById('realtime-status'),
  llmBadge: document.getElementById('llm-badge'),
  llmProbe: document.getElementById('llm-probe'),
};

const tabs = document.querySelectorAll('.tab');
const views = {
  contents: document.getElementById('view-contents'),
  run: document.getElementById('view-run'),
  queue: document.getElementById('view-queue'),
  stats: document.getElementById('view-stats'),
  metrics: document.getElementById('view-metrics'),
  roadmap: document.getElementById('view-roadmap'),
  production: document.getElementById('view-production'),
  feedback: document.getElementById('view-feedback'),
  ab: document.getElementById('view-ab'),
};
tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    tabs.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(views).forEach((v) => v.classList.remove('active'));
    const name = btn.dataset.tab;
    views[name].classList.add('active');
  });
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badge(text, kind) {
  return `<span class="badge ${escapeHtml(kind ?? '')}">${escapeHtml(text)}</span>`;
}

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
}

async function postJson(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(`${url} ${r.status}: ${json.error ?? text}`);
  return json;
}

async function loadLlmBadge() {
  try {
    const r = await fetchJson('/api/llm');
    const mock = r.provider === 'mock';
    els.llmBadge.textContent = mock ? `LLM: mock (${r.model})` : `LLM: ${r.provider} · ${r.model}`;
    els.llmBadge.className = `badge llm-badge ${mock ? 'mock' : 'live'}`;
    els.llmBadge.title = r.warning ?? '';
  } catch (e) {
    els.llmBadge.textContent = 'LLM: error';
    els.llmBadge.className = 'badge llm-badge fail';
    els.llmBadge.title = String(e);
  }
}

async function probeLlm() {
  els.llmBadge.textContent = 'LLM: probing…';
  els.llmBadge.className = 'badge llm-badge';
  try {
    const r = await postJson('/api/llm/probe', {});
    if (r.ok) {
      els.llmBadge.textContent = `LLM: ${r.provider} ok ${r.latencyMs}ms`;
      els.llmBadge.className = 'badge llm-badge live';
    } else {
      const tail = r.status ? ` (${r.status})` : '';
      els.llmBadge.textContent = `LLM: unreachable${tail}`;
      els.llmBadge.className = 'badge llm-badge fail';
    }
  } catch (e) {
    els.llmBadge.textContent = `LLM: probe error`;
    els.llmBadge.className = 'badge llm-badge fail';
  }
}

async function loadContents() {
  const items = await fetchJson('/api/contents');
  if (items.length === 0) {
    els.contentList.innerHTML = '<div class="empty">暂无内容。先跑 <code>npm run bootstrap</code>。</div>';
    return;
  }
  els.contentList.innerHTML = items
    .map(
      (c) => `
      <div class="card">
        <div class="card-id">${escapeHtml(c.id)}</div>
        <div class="card-main">
          <div class="card-topic">${escapeHtml(c.topic)}</div>
          <div class="card-meta">
            ${badge(c.stage, c.stage)}
            <span>persona=${escapeHtml(c.persona ?? '?')}</span>
            <span>posts=${c.posts.length}</span>
            <span>engagement=${c.engagement.length}</span>
          </div>
        </div>
        <a href="?id=${encodeURIComponent(c.id)}" data-id="${escapeHtml(c.id)}" class="tab">详情</a>
      </div>
    `,
    )
    .join('');
  els.contentList.querySelectorAll('a[data-id]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const id = a.dataset.id;
      loadAbReport(id);
      document.querySelector('[data-tab="ab"]').click();
      els.abContentId.value = id;
    });
  });
}

async function loadQueue() {
  const data = await fetchJson('/api/queue');
  const { summary, items } = data;
  els.queueSummary.textContent = `total=${summary.total} pending=${summary.byStatus.pending} posting=${summary.byStatus.posting} posted=${summary.byStatus.posted} retry=${summary.byStatus.failed_retry} dead=${summary.byStatus.failed_dead}`;
  if (items.length === 0) {
    els.queueList.innerHTML = '<div class="empty">队列为空。</div>';
    return;
  }
  els.queueList.innerHTML = items
    .map(
      (it) => `
      <div class="card">
        <div class="card-id">${escapeHtml(it.id)}</div>
        <div class="card-main">
          <div class="card-topic">c=${escapeHtml(it.contentId)} · ${escapeHtml(it.platform)}</div>
          <div class="card-meta">
            ${badge(it.status, it.status)}
            <span>attempts=${it.attempts}/${it.maxAttempts}</span>
            <span>next=${escapeHtml(it.nextAttemptAt)}</span>
            ${it.lastError ? `<span>err=${escapeHtml(it.lastError)}</span>` : ''}
          </div>
        </div>
      </div>
    `,
    )
    .join('');
}

async function loadFeedback() {
  const data = await fetchJson('/api/feedback');
  const { windowDays, totalRecords, lastUpdated, recentCount } = data;
  els.feedbackSummary.textContent =
    `window=${windowDays}d total=${totalRecords} recent(within window)=${recentCount} lastUpdated=${lastUpdated ?? '-'}`;
}

async function loadStats() {
  const data = await fetchJson('/api/stats');
  els.statsOutput.textContent = JSON.stringify(data, null, 2);
}

async function loadMetrics() {
  const data = await fetchJson('/api/metrics');
  els.metricsOutput.textContent = JSON.stringify(data, null, 2);
}

async function loadRoadmap() {
  const data = await fetchJson('/api/roadmap');
  const production = data.production ?? {};
  els.roadmapOutput.textContent = JSON.stringify({
    production,
    roadmap: {
      replies: data.replies?.length ?? 0,
      budget: data.cost,
      ab: data.ab,
      channelPlan: data.channelPlan,
      e2e: data.e2e,
      realtime: data.realtime,
      audit: data.audit,
    },
  }, null, 2);
}

async function loadProduction() {
  const data = await fetchJson('/api/production');
  els.productionOutput.textContent = JSON.stringify({
    replyQueue: data.replyQueue,
    tokenLedger: data.tokenLedger,
    audit: data.audit,
    channel: data.channel,
    release: data.release,
    budget: data.budget,
  }, null, 2);
}

const bulkEndpoints = {
  pause: '/api/bulk/pause',
  resume: '/api/bulk/resume',
  retry: '/api/bulk/retry',
  cancel: '/api/bulk/cancel',
};

async function runBulk(action, body) {
  els.bulkStatus.textContent = `running ${action}…`;
  try {
    const r = await postJson(bulkEndpoints[action], body ?? {});
    els.bulkStatus.textContent = `[ok] ${action} changed=${r.changed}`;
    await loadContents();
    await loadQueue();
  } catch (e) {
    els.bulkStatus.textContent = `[error] ${e.message}`;
  }
}

async function loadAbReport(id) {
  if (!id) {
    els.abOutput.textContent = '请输入 content id';
    return;
  }
  try {
    const r = await fetchJson(`/api/ab?id=${encodeURIComponent(id)}`);
    els.abOutput.textContent = JSON.stringify(r, null, 2);
  } catch (e) {
    els.abOutput.textContent = `[error] ${e.message}`;
  }
}

els.abLoad.addEventListener('click', () => loadAbReport(els.abContentId.value.trim()));
els.bulkPause.addEventListener('click', () => runBulk('pause', { stage: 'review' }));
els.bulkResume.addEventListener('click', () => runBulk('resume', {}));
els.bulkRetry.addEventListener('click', () => runBulk('retry', {}));
els.bulkCancel.addEventListener('click', () => runBulk('cancel', {}));

els.runSubmit.addEventListener('click', async () => {
  const topic = els.runTopic.value.trim();
  if (!topic) {
    els.runOutput.textContent = '[error] topic is required';
    return;
  }
  const persona = els.runPersona.value.trim();
  els.runOutput.textContent = '[ok] running pipeline…';
  try {
    const r = await postJson('/api/run', { topic, ...(persona ? { persona } : {}) });
    els.runOutput.textContent = `[ok] created ${r.id} (stage=${r.stage}, persona=${r.persona})`;
    await loadContents();
  } catch (e) {
    els.runOutput.textContent = `[error] ${e.message}`;
  }
});

els.queueWork.addEventListener('click', async () => {
  els.queueWorkStatus.textContent = 'running…';
  try {
    const r = await postJson('/api/queue/work', {});
    els.queueWorkStatus.textContent = `[ok] scanned=${r.scanned}`;
    await loadQueue();
  } catch (e) {
    els.queueWorkStatus.textContent = `[error] ${e.message}`;
  }
});

async function refreshRealtimePanels() {
  await Promise.all([loadContents(), loadQueue(), loadStats(), loadMetrics(), loadRoadmap(), loadProduction()]);
}

function connectRealtimeEvents() {
  if (typeof EventSource === 'undefined' || !els.realtimeStatus) {
    if (els.realtimeStatus) els.realtimeStatus.textContent = '实时: unsupported';
    return;
  }
  const source = new EventSource('/api/events');
  source.addEventListener('open', () => {
    els.realtimeStatus.textContent = '实时: connected';
    els.realtimeStatus.className = 'badge realtime-badge live';
  });
  source.addEventListener('snapshot', async (event) => {
    try {
      const data = JSON.parse(event.data);
      els.realtimeStatus.textContent = `实时: ${data.contents} contents / ${data.queue.total} queue`;
      els.realtimeStatus.className = 'badge realtime-badge live';
      await refreshRealtimePanels();
    } catch (e) {
      els.realtimeStatus.textContent = '实时: parse error';
      els.realtimeStatus.className = 'badge realtime-badge fail';
    }
  });
  source.addEventListener('error', () => {
    els.realtimeStatus.textContent = '实时: reconnecting…';
    els.realtimeStatus.className = 'badge realtime-badge fail';
  });
}

els.refreshAll.addEventListener('click', () => main());
els.llmProbe.addEventListener('click', () => probeLlm());

async function main() {
  try {
    await loadLlmBadge();
    await loadContents();
    await loadQueue();
    await loadFeedback();
    await loadStats();
    await loadMetrics();
    await loadRoadmap();
    await loadProduction();
  } catch (e) {
    console.error(e);
  }
}

main();
connectRealtimeEvents();
