const state = { tenders: [], stages: [], search: '', statusFilter: '' };

const el = (sel) => document.querySelector(sel);
const fmtMoney = (v) => (v == null || v === '' ? '-' : 'RM ' + Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (v) => (v ? v : '-');
const slug = (s) => s.replace(/[^a-zA-Z]/g, '');

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function loadStages() {
  state.stages = await api('/api/stages');
  const sel = el('#statusFilter');
  state.stages.forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s;
    opt.textContent = s;
    sel.appendChild(opt);
  });
}

async function loadTenders() {
  state.tenders = await api('/api/tenders');
  renderSummary();
  renderTable();
}

function renderSummary() {
  const total = state.tenders.length;
  const closed = state.tenders.filter((t) => t.status === 'Closed').length;
  const active = total - closed;
  const totalEst = state.tenders.reduce((sum, t) => sum + (t.est_value || 0), 0);
  const totalContract = state.tenders.reduce((sum, t) => sum + (t.contract_value || 0), 0);

  el('#summaryCards').innerHTML = `
    <div class="card"><div class="num">${total}</div><div class="label">Total Tenders</div></div>
    <div class="card"><div class="num">${active}</div><div class="label">In Progress</div></div>
    <div class="card"><div class="num">${closed}</div><div class="label">Closed</div></div>
    <div class="card"><div class="num">${fmtMoney(totalEst)}</div><div class="label">Est. Value (Total)</div></div>
    <div class="card"><div class="num">${fmtMoney(totalContract)}</div><div class="label">Awarded Value (Total)</div></div>
  `;
}

function filteredTenders() {
  const q = state.search.toLowerCase();
  return state.tenders.filter((t) => {
    const matchesSearch = !q || [t.tender_no, t.title, t.department].some((f) => (f || '').toLowerCase().includes(q));
    const matchesStatus = !state.statusFilter || t.status === state.statusFilter;
    return matchesSearch && matchesStatus;
  });
}

function renderTable() {
  const rows = filteredTenders();
  const tbody = el('#tenderTableBody');
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">No tenders found. Create one to get started.</div></td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map((t) => `
    <tr data-id="${t.id}">
      <td>${t.tender_no}</td>
      <td>${t.title}</td>
      <td>${t.department || '-'}</td>
      <td>${fmtMoney(t.est_value)}</td>
      <td><span class="badge stage-${slug(t.status)}">${t.status}</span></td>
      <td>${fmtDate(t.request_date)}</td>
      <td>${t.winning_bidder || '-'}</td>
      <td><button class="btn small" data-view="${t.id}">View</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => openDetail(tr.dataset.id));
  });
}

// ---- New tender modal ----

el('#newTenderBtn').addEventListener('click', () => {
  el('#newTenderForm').reset();
  el('#newModalBackdrop').classList.add('open');
});
el('#cancelNewTender').addEventListener('click', () => el('#newModalBackdrop').classList.remove('open'));
el('#newModalBackdrop').addEventListener('click', (e) => {
  if (e.target === el('#newModalBackdrop')) el('#newModalBackdrop').classList.remove('open');
});

el('#newTenderForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/tenders', { method: 'POST', body: JSON.stringify(data) });
    el('#newModalBackdrop').classList.remove('open');
    await loadTenders();
  } catch (err) {
    alert(err.message);
  }
});

// ---- Search / filter ----

el('#searchInput').addEventListener('input', (e) => { state.search = e.target.value; renderTable(); });
el('#statusFilter').addEventListener('change', (e) => { state.statusFilter = e.target.value; renderTable(); });

// ---- Detail modal ----

el('#closeDetail').addEventListener('click', () => el('#detailModalBackdrop').classList.remove('open'));
el('#detailModalBackdrop').addEventListener('click', (e) => {
  if (e.target === el('#detailModalBackdrop')) el('#detailModalBackdrop').classList.remove('open');
});

async function openDetail(id) {
  const t = await api(`/api/tenders/${id}`);
  renderDetail(t);
  el('#detailModalBackdrop').classList.add('open');
}

function renderDetail(t) {
  const currentIdx = state.stages.indexOf(t.status);
  const stageTrack = state.stages.map((s, i) => {
    const cls = i < currentIdx ? 'done' : i === currentIdx ? 'current' : '';
    return `<div class="stage-pill ${cls}">${s}</div>`;
  }).join('');

  const next = state.stages[currentIdx + 1];
  const isClosed = t.status === 'Closed';

  const bidderRows = t.bidders.length
    ? t.bidders.map((b) => `
        <div class="bidder-row">
          <span>${b.name}</span>
          <span>${fmtMoney(b.bid_amount)}</span>
          <span>${b.status}</span>
          <button class="btn small" data-set-winner="${b.id}" data-name="${b.name}" data-amount="${b.bid_amount || ''}">Set as Winner</button>
          <button class="btn small danger" data-del-bidder="${b.id}">Remove</button>
        </div>
      `).join('')
    : '<div class="empty-state">No bidders added yet.</div>';

  const historyItems = t.history.map((h) => `<div class="history-item">${h.changed_at} — ${h.status}${h.note ? ' · ' + h.note : ''}</div>`).join('');

  el('#detailContent').innerHTML = `
    <h2>${t.tender_no} — ${t.title}</h2>
    <div class="stage-track">${stageTrack}</div>

    <div class="detail-grid">
      <div><span class="label">Department</span>${t.department || '-'}</div>
      <div><span class="label">Estimated Value</span>${fmtMoney(t.est_value)}</div>
      <div><span class="label">Request Date</span>${fmtDate(t.request_date)}</div>
      <div><span class="label">Publish Date</span>${fmtDate(t.publish_date)}</div>
      <div><span class="label">Closing Date</span>${fmtDate(t.close_date)}</div>
      <div><span class="label">Award Date</span>${fmtDate(t.award_date)}</div>
      <div><span class="label">Contract Signed</span>${fmtDate(t.contract_signed_date)}</div>
      <div><span class="label">Winning Bidder</span>${t.winning_bidder || '-'}</div>
      <div><span class="label">Contract Value</span>${fmtMoney(t.contract_value)}</div>
    </div>
    ${t.description ? `<div><span class="label">Description</span><p>${t.description}</p></div>` : ''}

    <div class="modal-actions" style="justify-content: flex-start;">
      ${next ? `<button class="btn primary" id="advanceBtn">Advance to "${next}"</button>` : ''}
      ${!isClosed ? `<button class="btn" id="markClosedBtn">Mark Closed</button>` : ''}
      <button class="btn danger" id="deleteTenderBtn">Delete Tender</button>
    </div>

    <div class="section-title">Bidders</div>
    <div id="bidderList">${bidderRows}</div>
    <form class="add-bidder-form" id="addBidderForm">
      <input name="name" placeholder="Bidder name" required />
      <input name="bid_amount" type="number" step="0.01" placeholder="Bid amount" />
      <input name="submitted_date" type="date" />
      <button type="submit" class="btn">+ Add Bidder</button>
    </form>

    <div class="section-title">Status History</div>
    <div id="historyList">${historyItems || '<div class="empty-state">No history yet.</div>'}</div>
  `;

  if (next) {
    el('#advanceBtn').addEventListener('click', async () => {
      try {
        await api(`/api/tenders/${t.id}/status`, { method: 'POST', body: JSON.stringify({ status: next }) });
        await loadTenders();
        openDetail(t.id);
      } catch (err) { alert(err.message); }
    });
  }
  if (!isClosed) {
    el('#markClosedBtn').addEventListener('click', async () => {
      try {
        await api(`/api/tenders/${t.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'Closed' }) });
        await loadTenders();
        openDetail(t.id);
      } catch (err) { alert(err.message); }
    });
  }

  el('#deleteTenderBtn').addEventListener('click', async () => {
    if (!confirm('Delete this tender permanently?')) return;
    await api(`/api/tenders/${t.id}`, { method: 'DELETE' });
    el('#detailModalBackdrop').classList.remove('open');
    await loadTenders();
  });

  el('#addBidderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api(`/api/tenders/${t.id}/bidders`, { method: 'POST', body: JSON.stringify(data) });
      openDetail(t.id);
    } catch (err) { alert(err.message); }
  });

  document.querySelectorAll('[data-set-winner]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/tenders/${t.id}`, {
          method: 'PUT',
          body: JSON.stringify({ winning_bidder: btn.dataset.name, contract_value: btn.dataset.amount || null }),
        });
        await loadTenders();
        openDetail(t.id);
      } catch (err) { alert(err.message); }
    });
  });

  document.querySelectorAll('[data-del-bidder]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api(`/api/bidders/${btn.dataset.delBidder}`, { method: 'DELETE' });
      openDetail(t.id);
    });
  });
}

(async function init() {
  await loadStages();
  await loadTenders();
})();
