const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');
const { calcKsaEos, calcServiceDuration, calcMonthlyAccrual } = require('../payrollCalc');

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
  const VALID = ['Pending', 'Approved', 'Paid', 'Accrual'];
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

router.delete('/', requireCompanyRole('managePayroll'), async (req, res) => {
  await db('eos_records').where({ company_id: req.companyId }).delete();
  res.json({ ok: true });
});

// Saves a point-in-time snapshot of every active employee's accrued EOS
// liability as of today — this is what feeds the "Transactions Log" view
// and lets a company keep a dated record of its provisioning history.
router.post('/snapshot', requireCompanyRole('managePayroll'), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const employees = await db('employees')
    .where({ company_id: req.companyId, status: 'Active' })
    .whereNotNull('hire_date');

  const eligible = employees.filter((e) => Number(e.basic || 0) + Number(e.housing || 0) > 0);
  if (!eligible.length) {
    return res.status(400).json({ error: 'No active employees with a hire date and salary to snapshot' });
  }

  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const rows = eligible.map((emp) => {
    const calc = calcKsaEos(emp.basic, emp.housing, emp.hire_date, today, 'terminated');
    return {
      company_id: req.companyId,
      employee_id: emp.id,
      namear_snapshot: emp.namear,
      empno_snapshot: emp.empno,
      dept_snapshot: emp.dept,
      hire_date: emp.hire_date,
      end_date: today,
      reason: 'snapshot',
      basic: emp.basic,
      housing: emp.housing,
      gratuity: calc.gratuity,
      other_dues: 0,
      deductions: 0,
      net_eos: calc.gratuity,
      status: 'Accrual',
      calc_date: today,
    };
  });
  await db('eos_records').insert(rows);
  res.status(201).json({ saved: rows.length, label: `Snapshot — ${monthName}` });
});

// Monthly accrual register (current liability per active employee), for
// the "Export Excel" button on the EOS Accruals Register.
router.get('/export/xlsx', requireCompanyRole('view'), async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const employees = await db('employees')
    .where({ company_id: req.companyId, status: 'Active' })
    .whereNotNull('hire_date')
    .orderBy('namear');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('EOS Accrual Register');
  sheet.columns = [
    { key: 'empno', header: 'الرقم الوظيفي / Emp No.', width: 14 },
    { key: 'namear', header: 'الاسم / Name', width: 24 },
    { key: 'dept', header: 'القسم / Dept', width: 18 },
    { key: 'hire', header: 'تاريخ التعيين / Hire Date', width: 14 },
    { key: 'years', header: 'السنوات / Years', width: 8 },
    { key: 'months', header: 'الأشهر / Months', width: 8 },
    { key: 'basic', header: 'الأساسي / Basic', width: 12 },
    { key: 'housing', header: 'السكن / Housing', width: 12 },
    { key: 'monthlyAccrual', header: 'الاستحقاق الشهري / Monthly Accrual', width: 18 },
    { key: 'eosLiability', header: 'إجمالي المكافأة / EOS Liability', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  employees.forEach((emp) => {
    if (Number(emp.basic || 0) + Number(emp.housing || 0) <= 0) return;
    const dur = calcServiceDuration(emp.hire_date, today);
    const monthly = calcMonthlyAccrual(emp.basic, emp.housing, dur.totalMonths);
    const calc = calcKsaEos(emp.basic, emp.housing, emp.hire_date, today, 'terminated');
    sheet.addRow({
      empno: emp.empno, namear: emp.namear, dept: emp.dept, hire: emp.hire_date,
      years: dur.years, months: dur.months,
      basic: Number(emp.basic), housing: Number(emp.housing),
      monthlyAccrual: Math.round(monthly), eosLiability: Math.round(calc.gratuity),
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="eos-accrual-register-${today}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
