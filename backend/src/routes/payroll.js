const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');
const { calcPayrollLine } = require('../payrollCalc');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const runToApi = (r) => ({
  id: r.id,
  month: r.month,
  yearG: r.year_g,
  yearH: r.year_h,
  workDays: r.work_days,
  status: r.status,
});

const lineToApi = (l) => ({
  id: l.id,
  employeeId: l.employee_id,
  namear: l.namear_snapshot,
  dept: l.dept_snapshot,
  basic: Number(l.basic),
  housing: Number(l.housing),
  transport: Number(l.transport),
  other: Number(l.other),
  overtime: Number(l.overtime),
  bonus: Number(l.bonus),
  absentDays: l.absent_days,
  advanceDeduction: Number(l.advance_deduction),
  otherDeduction: Number(l.other_deduction),
  gosiEmp: Number(l.gosi_emp),
  healthIns: Number(l.health_ins),
  incomeTax: Number(l.income_tax),
  unionFee: Number(l.union_fee),
  gosiEr: Number(l.gosi_er),
  otherEr: Number(l.other_er),
  payMethod: l.pay_method,
  note: l.note,
  absenceDeduction: Number(l.absence_deduction),
  grossPay: Number(l.gross_pay),
  totalDeductions: Number(l.total_deductions),
  netPay: Number(l.net_pay),
  employerCost: Number(l.employer_cost),
});

const LINE_FIELDS = ['basic', 'housing', 'transport', 'other', 'overtime', 'bonus', 'absentDays', 'advanceDeduction', 'otherDeduction', 'gosiEmp', 'healthIns', 'incomeTax', 'unionFee', 'gosiEr', 'otherEr', 'payMethod', 'note'];
const LINE_COLUMN = { absentDays: 'absent_days', advanceDeduction: 'advance_deduction', otherDeduction: 'other_deduction', gosiEmp: 'gosi_emp', healthIns: 'health_ins', incomeTax: 'income_tax', unionFee: 'union_fee', gosiEr: 'gosi_er', otherEr: 'other_er', payMethod: 'pay_method' };

function lineInputToDb(body) {
  const row = {};
  for (const f of LINE_FIELDS) {
    if (body[f] !== undefined) row[LINE_COLUMN[f] || f] = body[f];
  }
  return row;
}

async function assertRun(companyId, runId) {
  const run = await db('payroll_runs').where({ id: runId, company_id: companyId }).first();
  if (!run) {
    const err = new Error('Payroll run not found');
    err.status = 404;
    throw err;
  }
  return run;
}

// --- Runs ---
router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('payroll_runs').where({ company_id: req.companyId }).orderBy([{ column: 'year_g', order: 'desc' }, { column: 'month', order: 'desc' }]);
  res.json(rows.map(runToApi));
});

router.post('/', requireCompanyRole('managePayroll'), async (req, res) => {
  const { month, yearG, yearH, workDays } = req.body || {};
  if (!month || !yearG) return res.status(400).json({ error: 'month and yearG are required' });
  const id = await db.insertReturningId(db, 'payroll_runs', {
    company_id: req.companyId,
    month,
    year_g: yearG,
    year_h: yearH || null,
    work_days: workDays || 30,
  });
  const created = await db('payroll_runs').where({ id }).first();
  res.status(201).json(runToApi(created));
});

router.get('/:runId', requireCompanyRole('view'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const lines = await db('payroll_lines').where({ payroll_run_id: run.id }).orderBy('namear_snapshot');
  res.json({ ...runToApi(run), lines: lines.map(lineToApi) });
});

router.patch('/:runId', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const { status, workDays } = req.body || {};
  const patch = { updated_at: new Date() };
  if (status !== undefined) patch.status = status;
  if (workDays !== undefined) patch.work_days = workDays;
  await db('payroll_runs').where({ id: run.id }).update(patch);

  // Work-day changes affect absence deductions for every line — recompute.
  if (workDays !== undefined) {
    const wd = workDays;
    const lines = await db('payroll_lines').where({ payroll_run_id: run.id });
    for (const l of lines) {
      const calc = calcPayrollLine(
        { basic: l.basic, housing: l.housing, transport: l.transport, other: l.other, overtime: l.overtime, bonus: l.bonus, absentDays: l.absent_days, advanceDeduction: l.advance_deduction, otherDeduction: l.other_deduction, gosiEmp: l.gosi_emp, healthIns: l.health_ins, incomeTax: l.income_tax, unionFee: l.union_fee, gosiEr: l.gosi_er, otherEr: l.other_er },
        wd
      );
      await db('payroll_lines').where({ id: l.id }).update({
        absence_deduction: calc.absenceDeduction,
        gross_pay: calc.grossPay,
        total_deductions: calc.totalDeductions,
        net_pay: calc.netPay,
        employer_cost: calc.employerCost,
      });
    }
  }
  res.json({ ok: true });
});

router.delete('/:runId', requireCompanyRole('managePayroll'), async (req, res) => {
  await assertRun(req.companyId, req.params.runId);
  await db('payroll_runs').where({ id: req.params.runId, company_id: req.companyId }).delete();
  res.json({ ok: true });
});

// Pull every active employee not already on this run in as a payroll line.
router.post('/:runId/generate', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const existing = await db('payroll_lines').where({ payroll_run_id: run.id }).pluck('employee_id');
  const employees = await db('employees').where({ company_id: req.companyId, status: 'Active' }).whereNotIn('id', existing.filter(Boolean).length ? existing : [-1]);

  for (const e of employees) {
    // Fixed monthly deductions on the employee record auto-apply as
    // "other deductions", same as the original app's calcEmpFixedDed.
    let fixedDedTotal = 0;
    try {
      const list = JSON.parse(e.fixed_deductions || '[]');
      if (Array.isArray(list)) fixedDedTotal = list.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    } catch { /* ignore malformed data */ }

    const line = {
      basic: e.basic, housing: e.housing, transport: e.transport, other: e.other,
      otherDeduction: fixedDedTotal,
      gosiEmp: e.gosi_emp, healthIns: e.health_ins, incomeTax: e.income_tax, unionFee: e.union_fee,
      gosiEr: e.gosi_er, otherEr: e.other_er,
    };
    const calc = calcPayrollLine(line, run.work_days);
    await db('payroll_lines').insert({
      payroll_run_id: run.id,
      employee_id: e.id,
      namear_snapshot: e.namear,
      dept_snapshot: e.dept,
      basic: e.basic,
      housing: e.housing,
      transport: e.transport,
      other: e.other,
      other_deduction: fixedDedTotal,
      gosi_emp: e.gosi_emp,
      health_ins: e.health_ins,
      income_tax: e.income_tax,
      union_fee: e.union_fee,
      gosi_er: e.gosi_er,
      other_er: e.other_er,
      pay_method: e.pay || 'Transfer',
      absence_deduction: calc.absenceDeduction,
      gross_pay: calc.grossPay,
      total_deductions: calc.totalDeductions,
      net_pay: calc.netPay,
      employer_cost: calc.employerCost,
    });
  }
  const lines = await db('payroll_lines').where({ payroll_run_id: run.id }).orderBy('namear_snapshot');
  res.json(lines.map(lineToApi));
});

// --- Lines ---
router.patch('/:runId/lines/:lineId', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const existing = await db('payroll_lines').where({ id: req.params.lineId, payroll_run_id: run.id }).first();
  if (!existing) return res.status(404).json({ error: 'Line not found' });

  const patch = lineInputToDb(req.body || {});
  const merged = { ...existing, ...patch };
  const calc = calcPayrollLine(
    { basic: merged.basic, housing: merged.housing, transport: merged.transport, other: merged.other, overtime: merged.overtime, bonus: merged.bonus, absentDays: merged.absent_days, advanceDeduction: merged.advance_deduction, otherDeduction: merged.other_deduction, gosiEmp: merged.gosi_emp, healthIns: merged.health_ins, incomeTax: merged.income_tax, unionFee: merged.union_fee, gosiEr: merged.gosi_er, otherEr: merged.other_er },
    run.work_days
  );
  patch.absence_deduction = calc.absenceDeduction;
  patch.gross_pay = calc.grossPay;
  patch.total_deductions = calc.totalDeductions;
  patch.net_pay = calc.netPay;
  patch.employer_cost = calc.employerCost;
  patch.updated_at = new Date();

  await db('payroll_lines').where({ id: existing.id }).update(patch);
  const row = await db('payroll_lines').where({ id: existing.id }).first();
  res.json(lineToApi(row));
});

router.delete('/:runId/lines/:lineId', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const deleted = await db('payroll_lines').where({ id: req.params.lineId, payroll_run_id: run.id }).delete();
  if (!deleted) return res.status(404).json({ error: 'Line not found' });
  res.json({ ok: true });
});

module.exports = router;
