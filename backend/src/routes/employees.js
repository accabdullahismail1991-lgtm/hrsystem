const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

// Column order shared by export and import so a re-uploaded export round-trips.
const IMPORT_EXPORT_COLUMNS = [
  { key: 'namear', header: 'الاسم / Name', width: 26 },
  { key: 'empno', header: 'الرقم الوظيفي / Employee No.', width: 16 },
  { key: 'idno', header: 'رقم الهوية / National ID', width: 16 },
  { key: 'dept', header: 'القسم / Department', width: 18 },
  { key: 'jobar', header: 'المسمى الوظيفي / Job Title', width: 18 },
  { key: 'basic', header: 'الأساسي / Basic', width: 12 },
  { key: 'housing', header: 'السكن / Housing', width: 12 },
  { key: 'transport', header: 'بدل النقل / Transport', width: 12 },
  { key: 'other', header: 'بدلات أخرى / Other', width: 12 },
  { key: 'status', header: 'الحالة / Status', width: 12 },
  { key: 'hire', header: 'تاريخ التعيين / Hire Date (YYYY-MM-DD)', width: 20 },
  { key: 'phone', header: 'الجوال / Phone', width: 14 },
  { key: 'email', header: 'البريد الإلكتروني / Email', width: 22 },
];

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
  project: r.project,
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

const FIELDS = ['branchId', 'empno', 'idno', 'idtype', 'idexp', 'iqama', 'passport', 'namear', 'nameen', 'dept', 'jobar', 'joben', 'cc', 'project', 'nat', 'gender', 'dob', 'basic', 'housing', 'transport', 'other', 'status', 'hire', 'phone', 'email', 'bank', 'iban', 'swift', 'pay', 'gosiEmpPct', 'gosiEmp', 'healthIns', 'incomeTax', 'unionFee', 'gosiErPct', 'gosiEr', 'otherEr', 'notes', 'fixedDeductions', 'attachments'];
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

router.get('/export/xlsx', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('employees').where({ company_id: req.companyId }).orderBy('namear');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Employees');
  sheet.columns = IMPORT_EXPORT_COLUMNS;
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => {
    sheet.addRow({
      namear: r.namear, empno: r.empno, idno: r.idno, dept: r.dept, jobar: r.jobar,
      basic: Number(r.basic), housing: Number(r.housing), transport: Number(r.transport), other: Number(r.other),
      status: r.status, hire: r.hire_date, phone: r.phone, email: r.email,
    });
  });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.xlsx"');
  await workbook.xlsx.write(res);
  res.end();
});

// Parses an uploaded workbook and returns a preview — nothing is written
// to the database until /import/commit is called with the reviewed rows.
router.post('/import/parse', requireCompanyRole('manageEmployees'), async (req, res) => {
  const { fileBase64 } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: 'fileBase64 is required' });

  const base64 = fileBase64.includes(',') ? fileBase64.split(',')[1] : fileBase64;
  const buffer = Buffer.from(base64, 'base64');
  if (buffer.length > 5 * 1024 * 1024) return res.status(400).json({ error: 'File exceeds 5MB' });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return res.status(400).json({ error: 'Could not read this file as an Excel workbook (.xlsx)' });
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return res.status(400).json({ error: 'Workbook has no sheets' });

  const keys = IMPORT_EXPORT_COLUMNS.map((c) => c.key);
  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const cells = row.values.slice(1); // exceljs row.values is 1-indexed with a leading empty slot
    const record = {};
    keys.forEach((key, i) => {
      const raw = cells[i];
      const value = raw && typeof raw === 'object' && raw.text !== undefined ? raw.text : raw;
      if (['basic', 'housing', 'transport', 'other'].includes(key)) {
        record[key] = Number(value) || 0;
      } else if (key === 'hire' && value instanceof Date) {
        record[key] = value.toISOString().slice(0, 10);
      } else {
        record[key] = value !== undefined && value !== null ? String(value).trim() : '';
      }
    });
    if (record.namear) rows.push(record);
  });

  res.json({ rows });
});

router.post('/import/commit', requireCompanyRole('manageEmployees'), async (req, res) => {
  const { rows } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) return res.status(400).json({ error: 'rows must be a non-empty array' });

  let created = 0;
  await db.transaction(async (trx) => {
    for (const r of rows) {
      if (!r.namear) continue;
      const row = toDb(r);
      row.company_id = req.companyId;
      if (!row.status) row.status = 'Active';
      await trx('employees').insert(row);
      created++;
    }
  });
  res.status(201).json({ created });
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
