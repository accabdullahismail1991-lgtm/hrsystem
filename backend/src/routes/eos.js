const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');
const { calcKsaEos } = require('../payrollCalc');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const toApi = (r) => ({
  id: r.id,
  employeeId: r.employee_id,
  namear: r.namear_snapshot,
  empno: r.empno_snapshot,
  dept: r.dept_snapshot,
  hire: r.hire_date,
  end: r.end_date,
  reason: r.reason,
  basic: Number(r.basic),
  housing: Number(r.housing),
  gratuity: Number(r.gratuity),
  otherDues: Number(r.other_dues),
  deductions: Number(r.deductions),
  netEos: Number(r.net_eos),
  status: r.status,
  calcDate: r.calc_date,
});

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('eos_records').where({ company_id: req.companyId }).orderBy('calc_date', 'desc');
  res.json(rows.map(toApi));
});

// Computes gratuity server-side from the employee's real hire date/salary —
// the client only picks who and why, it cannot submit a gratuity figure.
router.post('/', requireCompanyRole('managePayroll'), async (req, res) => {
  const { employeeId, endDate, reason, otherDues, deductions } = req.body || {};
  if (!employeeId || !endDate || !reason) return res.status(400).json({ error: 'employeeId, endDate, and reason are required' });

  const emp = await db('employees').where({ id: employeeId, company_id: req.companyId }).first();
  if (!emp) return res.status(400).json({ error: 'employeeId not found in this company' });
  if (!emp.hire_date) return res.status(400).json({ error: 'This employee has no hire date on file' });

  const calc = calcKsaEos(emp.basic, emp.housing, emp.hire_date, endDate, reason);
  const otherDuesN = Number(otherDues) || 0;
  const deductionsN = Number(deductions) || 0;
  const netEos = calc.gratuity + otherDuesN - deductionsN;

  const id = await db.insertReturningId(db, 'eos_records', {
    company_id: req.companyId,
    employee_id: emp.id,
    namear_snapshot: emp.namear,
    empno_snapshot: emp.empno,
    dept_snapshot: emp.dept,
    hire_date: emp.hire_date,
    end_date: endDate,
    reason,
    basic: emp.basic,
    housing: emp.housing,
    gratuity: calc.gratuity,
    other_dues: otherDuesN,
    deductions: deductionsN,
    net_eos: netEos,
    status: 'Pending',
    calc_date: new Date().toISOString().slice(0, 10),
  });
  const created = await db('eos_records').where({ id }).first();
  res.status(201).json(toApi(created));
});

router.patch('/:id', requireCompanyRole('managePayroll'), async (req, res) => {
  const { status } = req.body || {};
  const VALID = ['Pending', 'Approved', 'Paid'];
  if (!VALID.includes(status)) return res.status(400).json({ error: `status must be one of ${VALID.join(', ')}` });
  const updated = await db('eos_records').where({ id: req.params.id, company_id: req.companyId }).update({ status, updated_at: new Date() });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  const row = await db('eos_records').where({ id: req.params.id }).first();
  res.json(toApi(row));
});

router.delete('/:id', requireCompanyRole('managePayroll'), async (req, res) => {
  const deleted = await db('eos_records').where({ id: req.params.id, company_id: req.companyId }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
