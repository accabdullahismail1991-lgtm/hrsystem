const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const toApi = (r) => ({
  id: r.id,
  name: r.name,
  contractorType: r.contractor_type,
  contractType: r.contract_type,
  rate: Number(r.rate),
  currency: r.currency,
  dept: r.dept,
  project: r.project,
  startDate: r.start_date,
  endDate: r.end_date,
  phone: r.phone,
  email: r.email,
  status: r.status,
  notes: r.notes,
});

const FIELDS = ['name', 'contractorType', 'contractType', 'rate', 'currency', 'dept', 'project', 'startDate', 'endDate', 'phone', 'email', 'status', 'notes'];
const COLUMN = { contractorType: 'contractor_type', contractType: 'contract_type', startDate: 'start_date', endDate: 'end_date' };

function toDb(body) {
  const row = {};
  for (const f of FIELDS) {
    if (body[f] !== undefined) row[COLUMN[f] || f] = body[f];
  }
  return row;
}

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('contractors').where({ company_id: req.companyId }).orderBy('name');
  res.json(rows.map(toApi));
});

router.post('/', requireCompanyRole('manageContractors'), async (req, res) => {
  const row = toDb(req.body || {});
  if (!row.name) return res.status(400).json({ error: 'name is required' });
  row.company_id = req.companyId;
  const id = await db.insertReturningId(db, 'contractors', row);
  const created = await db('contractors').where({ id }).first();
  res.status(201).json(toApi(created));
});

router.get('/:id', requireCompanyRole('view'), async (req, res) => {
  const row = await db('contractors').where({ id: req.params.id, company_id: req.companyId }).first();
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(toApi(row));
});

router.patch('/:id', requireCompanyRole('manageContractors'), async (req, res) => {
  const patch = toDb(req.body || {});
  patch.updated_at = new Date();
  const updated = await db('contractors').where({ id: req.params.id, company_id: req.companyId }).update(patch);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  const row = await db('contractors').where({ id: req.params.id }).first();
  res.json(toApi(row));
});

router.delete('/:id', requireCompanyRole('manageContractors'), async (req, res) => {
  const deleted = await db('contractors').where({ id: req.params.id, company_id: req.companyId }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
