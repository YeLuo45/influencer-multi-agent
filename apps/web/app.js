'use strict';

const els = {
  contentList: document.getElementById('content-list'),
  queueSummary: document.getElementById('queue-summary'),
  queueList: document.getElementById('queue-list'),
  feedbackSummary: document.getElementById('feedback-summary'),
  abContentId: document.getElementById('ab-content-id'),
  abLoad: document.getElementById('ab-load'),
  abOutput: document.getElementById('ab-output'),
};

const tabs = document.querySelectorAll('.tab');
const views = {
  contents: document.getElementById('view-contents'),
  queue: document.getElementById('view-queue'),
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

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} ${r.status}`);
  return r.json();
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

async function main() {
  try {
    await loadContents();
    await loadQueue();
    await loadFeedback();
  } catch (e) {
    console.error(e);
  }
}

main();
