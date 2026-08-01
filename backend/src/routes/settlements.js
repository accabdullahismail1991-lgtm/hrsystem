const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('settlements')
    .join('advances', 'advances.id', 'settlements.advance_id')
    .where('settlements.company_id', req.companyId)
    .orderBy('settlements.date', 'desc')
    .select('settlements.id', 'settlements.amount', 'settlements.date', 'settlements.month', 'settlements.notes', 'advances.id as advanceId', 'advances.namear_snapshot as namear');
  res.json(rows.map((r) => ({ id: r.id, amount: Number(r.amount), date: r.date, month: r.month, notes: r.notes, advanceId: r.advanceId, namear: r.namear })));
});

router.delete('/:id', requireCompanyRole('managePayroll'), async (req, res) => {
  const deleted = await db('settlements').where({ id: req.params.id, company_id: req.companyId }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
