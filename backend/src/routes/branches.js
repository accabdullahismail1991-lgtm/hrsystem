const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const toApi = (r) => ({
  id: r.id,
  code: r.code,
  namear: r.name_ar,
  nameen: r.name_en,
  city: r.city,
  region: r.region,
  manager: r.manager,
  phone: r.phone,
  status: r.status,
});

const FIELDS = ['code', 'namear', 'nameen', 'city', 'region', 'manager', 'phone', 'status'];
const COLUMN = { namear: 'name_ar', nameen: 'name_en' };

function toDb(body) {
  const row = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) row[COLUMN[f] || f] = body[f];
  }
  return row;
}

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('branches').where({ company_id: req.companyId }).orderBy('name_ar');
  res.json(rows.map(toApi));
});

router.post('/', requireCompanyRole('manageBranches'), async (req, res) => {
  const row = toDb(req.body || {});
  if (!row.code || !row.name_ar) return res.status(400).json({ error: 'code and namear are required' });
  row.company_id = req.companyId;
  const id = await db.insertReturningId(db, 'branches', row);
  const created = await db('branches').where({ id }).first();
  res.status(201).json(toApi(created));
});

router.patch('/:id', requireCompanyRole('manageBranches'), async (req, res) => {
  const patch = toDb(req.body || {});
  patch.updated_at = new Date();
  const updated = await db('branches').where({ id: req.params.id, company_id: req.companyId }).update(patch);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  const row = await db('branches').where({ id: req.params.id }).first();
  res.json(toApi(row));
});

router.delete('/:id', requireCompanyRole('manageBranches'), async (req, res) => {
  const deleted = await db('branches').where({ id: req.params.id, company_id: req.companyId }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
