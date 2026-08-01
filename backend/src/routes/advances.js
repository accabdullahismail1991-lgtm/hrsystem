const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

async function withStatus(rows) {
  const ids = rows.map((r) => r.id);
  const paidByAdvance = {};
  if (ids.length) {
    const sums = await db('settlements').whereIn('advance_id', ids).groupBy('advance_id').select('advance_id').sum({ paid: 'amount' });
    sums.forEach((s) => (paidByAdvance[s.advance_id] = Number(s.paid) || 0));
  }
  return rows.map((r) => {
    const paid = paidByAdvance[r.id] || 0;
    const amount = Number(r.amount);
    const remain = Math.max(0, amount - paid);
    const status = remain <= 0 ? 'settled' : paid > 0 ? 'partial' : 'pending';
    return {
      id: r.id,
      employeeId: r.employee_id,
      namear: r.namear_snapshot,
      amount,
      monthly: Number(r.monthly),
      date: r.date,
      notes: r.notes,
      paid,
      remain,
      status,
    };
  });
}

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('advances').where({ company_id: req.companyId }).orderBy('date', 'desc');
  res.json(await withStatus(rows));
});

router.post('/', requireCompanyRole('managePayroll'), async (req, res) => {
  const { employeeId, amount, monthly, date, notes } = req.body || {};
  let namear = req.body?.namear;
  if (employeeId) {
    const emp = await db('employees').where({ id: employeeId, company_id: req.companyId }).first();
    if (!emp) return res.status(400).json({ error: 'employeeId not found in this company' });
    namear = emp.namear;
  }
  if (!namear || !amount) return res.status(400).json({ error: 'employeeId (or namear) and amount are required' });

  const id = await db.insertReturningId(db, 'advances', {
    company_id: req.companyId,
    employee_id: employeeId || null,
    namear_snapshot: namear,
    amount,
    monthly: monthly || amount,
    date: date || null,
    notes: notes || null,
  });
  const [created] = await withStatus([await db('advances').where({ id }).first()]);
  res.status(201).json(created);
});

router.get('/:id', requireCompanyRole('view'), async (req, res) => {
  const row = await db('advances').where({ id: req.params.id, company_id: req.companyId }).first();
  if (!row) return res.status(404).json({ error: 'Not found' });
  const settlements = await db('settlements').where({ advance_id: row.id }).orderBy('date', 'desc');
  const [advance] = await withStatus([row]);
  res.json({ ...advance, settlements: settlements.map((s) => ({ id: s.id, amount: Number(s.amount), date: s.date, month: s.month, notes: s.notes })) });
});

router.delete('/:id', requireCompanyRole('managePayroll'), async (req, res) => {
  const deleted = await db('advances').where({ id: req.params.id, company_id: req.companyId }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

// Record a repayment against this advance.
router.post('/:id/settlements', requireCompanyRole('managePayroll'), async (req, res) => {
  const advance = await db('advances').where({ id: req.params.id, company_id: req.companyId }).first();
  if (!advance) return res.status(404).json({ error: 'Advance not found' });
  const { amount, date, month, notes } = req.body || {};
  if (!amount) return res.status(400).json({ error: 'amount is required' });

  const id = await db.insertReturningId(db, 'settlements', {
    company_id: req.companyId,
    advance_id: advance.id,
    amount,
    date: date || null,
    month: month || null,
    notes: notes || null,
  });
  const created = await db('settlements').where({ id }).first();
  res.status(201).json({ id: created.id, amount: Number(created.amount), date: created.date, month: created.month, notes: created.notes });
});

module.exports = router;
