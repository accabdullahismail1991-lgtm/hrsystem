const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const toApi = (r) => ({
  id: r.id,
  employeeId: r.employee_id,
  namear: r.namear_snapshot,
  empno: r.empno_snapshot,
  workDate: r.work_date,
  regularHours: Number(r.regular_hours),
  overtimeHours: Number(r.overtime_hours),
  notes: r.notes,
});

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('daily_hours_logs').where({ company_id: req.companyId }).orderBy('work_date', 'desc');
  res.json(rows.map(toApi));
});

router.post('/', requireCompanyRole('managePayroll'), async (req, res) => {
  const { employeeId, workDate, regularHours, overtimeHours, notes } = req.body || {};
  if (!employeeId || !workDate) return res.status(400).json({ error: 'employeeId and workDate are required' });
  const reg = Number(regularHours) || 0;
  const ot = Number(overtimeHours) || 0;
  if (reg < 0 || reg > 24 || ot < 0 || ot > 24) return res.status(400).json({ error: 'Hours must be between 0 and 24' });

  const emp = await db('employees').where({ id: employeeId, company_id: req.companyId }).first();
  if (!emp) return res.status(400).json({ error: 'employeeId not found in this company' });

  const id = await db.insertReturningId(db, 'daily_hours_logs', {
    company_id: req.companyId,
    employee_id: emp.id,
    namear_snapshot: emp.namear,
    empno_snapshot: emp.empno,
    work_date: workDate,
    regular_hours: reg,
    overtime_hours: ot,
    notes: notes || null,
  });
  const created = await db('daily_hours_logs').where({ id }).first();
  res.status(201).json(toApi(created));
});

router.delete('/:id', requireCompanyRole('managePayroll'), async (req, res) => {
  const deleted = await db('daily_hours_logs').where({ id: req.params.id, company_id: req.companyId }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
