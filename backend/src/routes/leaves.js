const express = require('express');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');
const { calcAnnualLeaveBalance, allocateSickDays, OCCASION_LEAVE_MAX_DAYS } = require('../leaveCalc');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const LEAVE_TYPES = ['annual', 'sick', 'marriage', 'birth', 'death', 'hajj', 'exam', 'iddah_muslim', 'iddah_nonmuslim', 'unpaid', 'other'];

const toApi = (r) => ({
  id: r.id,
  employeeId: r.employee_id,
  namear: r.namear_snapshot,
  empno: r.empno_snapshot,
  leaveType: r.leave_type,
  startDate: r.start_date,
  endDate: r.end_date,
  days: r.days,
  paidDays: Number(r.paid_days),
  unpaidDays: Number(r.unpaid_days),
  payTier: r.pay_tier,
  status: r.status,
  notes: r.notes,
  createdAt: r.created_at,
});

function daysBetweenInclusive(start, end) {
  const s = new Date(start), e = new Date(end);
  return Math.round((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

router.get('/', requireCompanyRole('view'), async (req, res) => {
  const rows = await db('leave_requests').where({ company_id: req.companyId }).orderBy('start_date', 'desc');
  res.json(rows.map(toApi));
});

// Annual-leave accrual balance + sick-leave rolling-year usage for one
// employee — the client uses this to show "remaining balance" before
// submitting a request, but every request is still validated server-side.
router.get('/balance/:employeeId', requireCompanyRole('view'), async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const emp = await db('employees').where({ id: employeeId, company_id: req.companyId }).first();
  if (!emp) return res.status(404).json({ error: 'Employee not found' });

  const today = new Date().toISOString().slice(0, 10);
  const annualBalancePreview = calcAnnualLeaveBalance(emp.hire_date, today, 0);
  const usedAnnual = await db('leave_requests')
    .where({ company_id: req.companyId, employee_id: employeeId, leave_type: 'annual', status: 'Approved' })
    .andWhere('start_date', '>=', annualBalancePreview.serviceYearStart || '1900-01-01')
    .sum('days as total')
    .first();
  const annual = calcAnnualLeaveBalance(emp.hire_date, today, usedAnnual.total || 0);

  const oneYearAgo = new Date(); oneYearAgo.setDate(oneYearAgo.getDate() - 365);
  const priorSick = await db('leave_requests')
    .where({ company_id: req.companyId, employee_id: employeeId, leave_type: 'sick' })
    .andWhere('status', '!=', 'Rejected')
    .andWhere('start_date', '>=', oneYearAgo.toISOString().slice(0, 10))
    .sum('days as total')
    .first();

  res.json({ annual, sickUsedLast365Days: Number(priorSick.total) || 0 });
});

router.post('/', requireCompanyRole('manageLeaves'), async (req, res) => {
  const { employeeId, leaveType, startDate, endDate, notes } = req.body || {};
  if (!employeeId || !leaveType || !startDate || !endDate) {
    return res.status(400).json({ error: 'employeeId, leaveType, startDate, and endDate are required' });
  }
  if (!LEAVE_TYPES.includes(leaveType)) return res.status(400).json({ error: `leaveType must be one of ${LEAVE_TYPES.join(', ')}` });

  const emp = await db('employees').where({ id: employeeId, company_id: req.companyId }).first();
  if (!emp) return res.status(400).json({ error: 'employeeId not found in this company' });

  const days = daysBetweenInclusive(startDate, endDate);
  if (days < 1) return res.status(400).json({ error: 'endDate must be on or after startDate' });

  let paidDays = days, unpaidDays = 0, payTier = 'full';

  if (leaveType === 'annual') {
    const balance = calcAnnualLeaveBalance(emp.hire_date, startDate, 0);
    const used = await db('leave_requests')
      .where({ company_id: req.companyId, employee_id: employeeId, leave_type: 'annual', status: 'Approved' })
      .andWhere('start_date', '>=', balance.serviceYearStart || '1900-01-01')
      .sum('days as total')
      .first();
    const remaining = calcAnnualLeaveBalance(emp.hire_date, startDate, used.total || 0).remaining;
    if (days > remaining) {
      return res.status(400).json({ error: `Requested ${days} days exceeds the accrued annual leave balance (${remaining} days remaining)` });
    }
  } else if (leaveType === 'sick') {
    const oneYearAgo = new Date(startDate); oneYearAgo.setDate(oneYearAgo.getDate() - 365);
    const prior = await db('leave_requests')
      .where({ company_id: req.companyId, employee_id: employeeId, leave_type: 'sick' })
      .andWhere('status', '!=', 'Rejected')
      .andWhere('start_date', '>=', oneYearAgo.toISOString().slice(0, 10))
      .andWhere('start_date', '<', startDate)
      .sum('days as total')
      .first();
    const allocation = allocateSickDays(prior.total || 0, days);
    paidDays = allocation.paidDays;
    unpaidDays = allocation.unpaidDays;
    payTier = allocation.unpaid > 0 || allocation.threeQuarter > 0 ? 'mixed' : 'full';
  } else if (OCCASION_LEAVE_MAX_DAYS[leaveType]) {
    const max = OCCASION_LEAVE_MAX_DAYS[leaveType];
    if (days > max) return res.status(400).json({ error: `${leaveType} leave cannot exceed ${max} days per the executive regulations` });
  } else if (leaveType === 'unpaid') {
    paidDays = 0; unpaidDays = days; payTier = 'unpaid';
  }

  const id = await db.insertReturningId(db, 'leave_requests', {
    company_id: req.companyId,
    employee_id: emp.id,
    namear_snapshot: emp.namear,
    empno_snapshot: emp.empno,
    leave_type: leaveType,
    start_date: startDate,
    end_date: endDate,
    days,
    paid_days: paidDays,
    unpaid_days: unpaidDays,
    pay_tier: payTier,
    status: 'Pending',
    notes: notes || null,
  });
  const created = await db('leave_requests').where({ id }).first();
  res.status(201).json(toApi(created));
});

router.patch('/:id', requireCompanyRole('manageLeaves'), async (req, res) => {
  const { status } = req.body || {};
  const VALID = ['Pending', 'Approved', 'Rejected'];
  if (!VALID.includes(status)) return res.status(400).json({ error: `status must be one of ${VALID.join(', ')}` });
  const updated = await db('leave_requests').where({ id: req.params.id, company_id: req.companyId }).update({ status, updated_at: new Date() });
  if (!updated) return res.status(404).json({ error: 'Not found' });
  const row = await db('leave_requests').where({ id: req.params.id }).first();
  res.json(toApi(row));
});

router.delete('/:id', requireCompanyRole('manageLeaves'), async (req, res) => {
  const deleted = await db('leave_requests').where({ id: req.params.id, company_id: req.companyId }).delete();
  if (!deleted) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

module.exports = router;
