// Payment runs for external/subcontracted labor (contractors) — entirely
// separate from the employee payroll_runs, since these workers are outside
// this company's kafala (sponsorship) and paid under individual contracts,
// not payroll. No GOSI/statutory deductions apply here.
const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const runToApi = (r) => ({
  id: r.id,
  month: r.month,
  yearG: r.year_g,
  yearH: r.year_h,
  status: r.status,
});

const lineToApi = (l) => ({
  id: l.id,
  contractorId: l.contractor_id,
  name: l.name_snapshot,
  idNo: l.id_no_snapshot,
  contractType: l.contract_type_snapshot,
  sponsorName: l.sponsor_snapshot,
  amount: Number(l.amount),
  deduction: Number(l.deduction),
  netAmount: Number(l.net_amount),
  payMethod: l.pay_method,
  note: l.note,
});

async function assertRun(companyId, runId) {
  const run = await db('contractor_payroll_runs').where({ id: runId, company_id: companyId }).first();
  if (!run) {
    const err = new Error('Contractor payroll run not found');
    err.status = 404;
    throw err;
  }
  return run;
}

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('contractor_payroll_runs').where({ company_id: req.companyId }).orderBy([{ column: 'year_g', order: 'desc' }, { column: 'month', order: 'desc' }]);
  res.json(rows.map(runToApi));
});

router.post('/', requireCompanyRole('managePayroll'), async (req, res) => {
  const { month, yearG, yearH } = req.body || {};
  if (!month || !yearG) return res.status(400).json({ error: 'month and yearG are required' });
  const id = await db.insertReturningId(db, 'contractor_payroll_runs', {
    company_id: req.companyId,
    month,
    year_g: yearG,
    year_h: yearH || null,
  });
  const created = await db('contractor_payroll_runs').where({ id }).first();
  res.status(201).json(runToApi(created));
});

router.get('/:runId', requireCompanyRole('view'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const lines = await db('contractor_payroll_lines').where({ run_id: run.id }).orderBy('name_snapshot');
  res.json({ ...runToApi(run), lines: lines.map(lineToApi) });
});

router.patch('/:runId', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const { status } = req.body || {};
  const VALID = ['Draft', 'Approved', 'Paid'];
  if (status && !VALID.includes(status)) return res.status(400).json({ error: `status must be one of ${VALID.join(', ')}` });
  const patch = {};
  if (status) patch.status = status;
  patch.updated_at = new Date();
  await db('contractor_payroll_runs').where({ id: run.id }).update(patch);
  const updated = await db('contractor_payroll_runs').where({ id: run.id }).first();
  res.json(runToApi(updated));
});

router.delete('/:runId', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  await db('contractor_payroll_runs').where({ id: run.id }).delete();
  res.json({ ok: true });
});

// Pulls in every Active contractor not already on this run, with the
// line amount defaulting to their contract rate (editable afterward —
// e.g. to reflect actual days/hours worked for daily/hourly contracts).
router.post('/:runId/generate', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const existing = await db('contractor_payroll_lines').where({ run_id: run.id }).pluck('contractor_id');
  const contractors = await db('contractors')
    .where({ company_id: req.companyId, status: 'Active' })
    .whereNotIn('id', existing.filter(Boolean).length ? existing : [-1]);

  for (const c of contractors) {
    const amount = Number(c.rate) || 0;
    await db('contractor_payroll_lines').insert({
      run_id: run.id,
      contractor_id: c.id,
      name_snapshot: c.name,
      id_no_snapshot: c.id_no,
      contract_type_snapshot: c.contract_type,
      sponsor_snapshot: c.sponsor_name,
      amount,
      deduction: 0,
      net_amount: amount,
      pay_method: 'Transfer',
    });
  }
  const lines = await db('contractor_payroll_lines').where({ run_id: run.id }).orderBy('name_snapshot');
  res.json(lines.map(lineToApi));
});

router.patch('/:runId/lines/:lineId', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const line = await db('contractor_payroll_lines').where({ id: req.params.lineId, run_id: run.id }).first();
  if (!line) return res.status(404).json({ error: 'Line not found' });

  const patch = {};
  if (req.body.amount !== undefined) patch.amount = Number(req.body.amount) || 0;
  if (req.body.deduction !== undefined) patch.deduction = Number(req.body.deduction) || 0;
  if (req.body.payMethod !== undefined) patch.pay_method = req.body.payMethod;
  if (req.body.note !== undefined) patch.note = req.body.note;

  const amount = patch.amount !== undefined ? patch.amount : Number(line.amount);
  const deduction = patch.deduction !== undefined ? patch.deduction : Number(line.deduction);
  patch.net_amount = amount - deduction;
  patch.updated_at = new Date();

  await db('contractor_payroll_lines').where({ id: line.id }).update(patch);
  const updated = await db('contractor_payroll_lines').where({ id: line.id }).first();
  res.json(lineToApi(updated));
});

router.delete('/:runId/lines/:lineId', requireCompanyRole('managePayroll'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const deleted = await db('contractor_payroll_lines').where({ id: req.params.lineId, run_id: run.id }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

router.get('/:runId/export/xlsx', requireCompanyRole('view'), async (req, res) => {
  const run = await assertRun(req.companyId, req.params.runId);
  const lines = await db('contractor_payroll_lines').where({ run_id: run.id }).orderBy('name_snapshot');

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Contractor Payroll');
  sheet.columns = [
    { key: 'name', header: 'الاسم / Name', width: 24 },
    { key: 'idNo', header: 'رقم الهوية / ID No.', width: 16 },
    { key: 'contractType', header: 'نوع التعاقد / Contract Type', width: 14 },
    { key: 'sponsor', header: 'الجهة الكافلة / Sponsor', width: 20 },
    { key: 'amount', header: 'المبلغ / Amount', width: 12 },
    { key: 'deduction', header: 'الخصم / Deduction', width: 12 },
    { key: 'netAmount', header: 'الصافي / Net Amount', width: 12 },
    { key: 'payMethod', header: 'طريقة الدفع / Payment', width: 12 },
    { key: 'note', header: 'ملاحظات / Notes', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  lines.forEach((l) => {
    sheet.addRow({
      name: l.name_snapshot, idNo: l.id_no_snapshot, contractType: l.contract_type_snapshot, sponsor: l.sponsor_snapshot,
      amount: Number(l.amount), deduction: Number(l.deduction), netAmount: Number(l.net_amount),
      payMethod: l.pay_method, note: l.note,
    });
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="contractor-payroll-${run.month}-${run.year_g}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
