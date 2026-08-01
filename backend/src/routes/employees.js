const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function parseJsonArray(v) {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const toApi = (r) => ({
  id: r.id,
  branchId: r.branch_id,
  empno: r.empno,
  idno: r.idno,
  idtype: r.idtype,
  idexp: r.idexp,
  iqama: r.iqama,
  passport: r.passport,
  namear: r.namear,
  nameen: r.nameen,
  dept: r.dept,
  jobar: r.jobar,
  joben: r.joben,
  cc: r.cc,
  nat: r.nat,
  gender: r.gender,
  dob: r.dob,
  basic: Number(r.basic),
  housing: Number(r.housing),
  transport: Number(r.transport),
  other: Number(r.other),
  status: r.status,
  hire: r.hire_date,
  phone: r.phone,
  email: r.email,
  bank: r.bank,
  iban: r.iban,
  swift: r.swift,
  pay: r.pay,
  gosiEmpPct: Number(r.gosi_emp_pct),
  gosiEmp: Number(r.gosi_emp),
  healthIns: Number(r.health_ins),
  incomeTax: Number(r.income_tax),
  unionFee: Number(r.union_fee),
  gosiErPct: Number(r.gosi_er_pct),
  gosiEr: Number(r.gosi_er),
  otherEr: Number(r.other_er),
  notes: r.notes,
  fixedDeductions: parseJsonArray(r.fixed_deductions),
  attachments: parseJsonArray(r.attachments),
});

const FIELDS = ['branchId', 'empno', 'idno', 'idtype', 'idexp', 'iqama', 'passport', 'namear', 'nameen', 'dept', 'jobar', 'joben', 'cc', 'nat', 'gender', 'dob', 'basic', 'housing', 'transport', 'other', 'status', 'hire', 'phone', 'email', 'bank', 'iban', 'swift', 'pay', 'gosiEmpPct', 'gosiEmp', 'healthIns', 'incomeTax', 'unionFee', 'gosiErPct', 'gosiEr', 'otherEr', 'notes', 'fixedDeductions', 'attachments'];
const COLUMN = {
  branchId: 'branch_id', hire: 'hire_date',
  gosiEmpPct: 'gosi_emp_pct', gosiEmp: 'gosi_emp', healthIns: 'health_ins', incomeTax: 'income_tax', unionFee: 'union_fee',
  gosiErPct: 'gosi_er_pct', gosiEr: 'gosi_er', otherEr: 'other_er',
  fixedDeductions: 'fixed_deductions', attachments: 'attachments',
};
const JSON_FIELDS = new Set(['fixedDeductions', 'attachments']);

function toDb(body) {
  const row = {};
  for (const f of FIELDS) {
    if (body[f] === undefined) continue;
    row[COLUMN[f] || f] = JSON_FIELDS.has(f) ? JSON.stringify(body[f] || []) : body[f];
  }
  return row;
}

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('employees').where({ company_id: req.companyId }).orderBy('namear');
  res.json(rows.map(toApi));
});

router.post('/', requireCompanyRole('manageEmployees'), async (req, res) => {
  const row = toDb(req.body || {});
  if (!row.namear) return res.status(400).json({ error: 'namear is required' });
  row.company_id = req.companyId;
  const id = await db.insertReturningId(db, 'employees', row);
  const created = await db('employees').where({ id }).first();
  res.status(201).json(toApi(created));
});

router.get('/:id', requireCompanyRole('view'), async (req, res) => {
  const row = await db('employees').where({ id: req.params.id, company_id: req.companyId }).first();
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(toApi(row));
});

router.patch('/:id', requireCompanyRole('manageEmployees'), async (req, res) => {
  const patch = toDb(req.body || {});
  patch.updated_at = new Date();
  const updated = await db('employees').where({ id: req.params.id, company_id: req.companyId }).update(patch);
  if (!updated) return res.status(404).json({ error: 'Not found' });
  const row = await db('employees').where({ id: req.params.id }).first();
  res.json(toApi(row));
});

router.delete('/:id', requireCompanyRole('manageEmployees'), async (req, res) => {
  const deleted = await db('employees').where({ id: req.params.id, company_id: req.companyId }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
