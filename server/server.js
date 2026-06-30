const path = require('path');
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const STAGES = [
  'Request',
  'Tender Prep',
  'Advertised/Published',
  'Bids Received',
  'Evaluation',
  'Award',
  'Contract Signed',
  'Closed',
];

function nextStage(current) {
  const i = STAGES.indexOf(current);
  if (i === -1 || i === STAGES.length - 1) return null;
  return STAGES[i + 1];
}

// ---- Tenders ----

app.get('/api/stages', (req, res) => {
  res.json(STAGES);
});

app.get('/api/tenders', (req, res) => {
  const rows = db.prepare(`SELECT * FROM tenders ORDER BY created_at DESC`).all();
  res.json(rows);
});

app.get('/api/tenders/:id', (req, res) => {
  const tender = db.prepare(`SELECT * FROM tenders WHERE id = ?`).get(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found' });
  const bidders = db.prepare(`SELECT * FROM bidders WHERE tender_id = ? ORDER BY bid_amount ASC`).all(req.params.id);
  const history = db.prepare(`SELECT * FROM status_history WHERE tender_id = ? ORDER BY changed_at ASC`).all(req.params.id);
  res.json({ ...tender, bidders, history });
});

app.post('/api/tenders', (req, res) => {
  const {
    tender_no, title, department, description, est_value, request_date,
  } = req.body;
  if (!tender_no || !title) {
    return res.status(400).json({ error: 'tender_no and title are required' });
  }
  try {
    const stmt = db.prepare(`
      INSERT INTO tenders (tender_no, title, department, description, est_value, request_date, status)
      VALUES (?, ?, ?, ?, ?, ?, 'Request')
    `);
    const info = stmt.run(tender_no, title, department || null, description || null, est_value || null, request_date || null);
    db.prepare(`INSERT INTO status_history (tender_id, status, note) VALUES (?, 'Request', 'Tender request created')`).run(info.lastInsertRowid);
    const created = db.prepare(`SELECT * FROM tenders WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json(created);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Tender number already exists' });
    }
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/tenders/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM tenders WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Tender not found' });

  const fields = [
    'tender_no', 'title', 'department', 'description', 'est_value',
    'request_date', 'publish_date', 'close_date', 'award_date',
    'contract_signed_date', 'winning_bidder', 'contract_value',
  ];
  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  if (setClause) {
    db.prepare(`UPDATE tenders SET ${setClause}, updated_at = datetime('now') WHERE id = @id`)
      .run({ ...updates, id: req.params.id });
  }
  const updated = db.prepare(`SELECT * FROM tenders WHERE id = ?`).get(req.params.id);
  res.json(updated);
});

app.delete('/api/tenders/:id', (req, res) => {
  const info = db.prepare(`DELETE FROM tenders WHERE id = ?`).run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Tender not found' });
  res.status(204).end();
});

// Advance / set status explicitly
app.post('/api/tenders/:id/status', (req, res) => {
  const tender = db.prepare(`SELECT * FROM tenders WHERE id = ?`).get(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found' });

  const { status, note, date } = req.body;
  const targetStatus = status || nextStage(tender.status);
  if (!targetStatus) return res.status(400).json({ error: 'No next stage available' });
  if (!STAGES.includes(targetStatus)) return res.status(400).json({ error: 'Invalid stage' });

  const dateFieldByStage = {
    'Advertised/Published': 'publish_date',
    'Bids Received': 'close_date',
    'Award': 'award_date',
    'Contract Signed': 'contract_signed_date',
  };
  const dateField = dateFieldByStage[targetStatus];

  const updates = { status: targetStatus, id: req.params.id };
  let setClause = `status = @status`;
  if (dateField) {
    updates[dateField] = date || new Date().toISOString().slice(0, 10);
    setClause += `, ${dateField} = @${dateField}`;
  }
  db.prepare(`UPDATE tenders SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run(updates);
  db.prepare(`INSERT INTO status_history (tender_id, status, note) VALUES (?, ?, ?)`)
    .run(req.params.id, targetStatus, note || null);

  const updated = db.prepare(`SELECT * FROM tenders WHERE id = ?`).get(req.params.id);
  res.json(updated);
});

// ---- Bidders ----

app.post('/api/tenders/:id/bidders', (req, res) => {
  const tender = db.prepare(`SELECT * FROM tenders WHERE id = ?`).get(req.params.id);
  if (!tender) return res.status(404).json({ error: 'Tender not found' });
  const { name, bid_amount, submitted_date, remarks } = req.body;
  if (!name) return res.status(400).json({ error: 'Bidder name is required' });
  const info = db.prepare(`
    INSERT INTO bidders (tender_id, name, bid_amount, submitted_date, remarks)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.id, name, bid_amount || null, submitted_date || null, remarks || null);
  const created = db.prepare(`SELECT * FROM bidders WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json(created);
});

app.put('/api/bidders/:id', (req, res) => {
  const existing = db.prepare(`SELECT * FROM bidders WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Bidder not found' });
  const fields = ['name', 'bid_amount', 'submitted_date', 'status', 'remarks'];
  const updates = {};
  for (const f of fields) {
    if (req.body[f] !== undefined) updates[f] = req.body[f];
  }
  const setClause = Object.keys(updates).map((k) => `${k} = @${k}`).join(', ');
  if (setClause) {
    db.prepare(`UPDATE bidders SET ${setClause} WHERE id = @id`).run({ ...updates, id: req.params.id });
  }
  const updated = db.prepare(`SELECT * FROM bidders WHERE id = ?`).get(req.params.id);
  res.json(updated);
});

app.delete('/api/bidders/:id', (req, res) => {
  const info = db.prepare(`DELETE FROM bidders WHERE id = ?`).run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Bidder not found' });
  res.status(204).end();
});

const PORT = process.env.PORT || 4173;
app.listen(PORT, () => {
  console.log(`Tender Tracker running at http://localhost:${PORT}`);
});
