// Leave calculations per KSA Labor Law Executive Regulations Articles 33-44.
// Kept as pure functions (no I/O), same pattern as payrollCalc.js.

const DAY_MS = 24 * 60 * 60 * 1000;

// Annual leave entitlement: 21 days/year, rising to 30 days/year once the
// employee has 5 continuous years of service (Art. 33). Accrual is prorated
// across the current service-year (anniversary of hire date to today).
function calcAnnualLeaveBalance(hireDate, today, usedDaysThisServiceYear) {
  if (!hireDate) return { entitlementPerYear: 0, serviceYearStart: null, accrued: 0, used: 0, remaining: 0 };
  const hire = new Date(hireDate);
  const now = new Date(today);
  const totalYears = (now - hire) / DAY_MS / 365;
  const entitlementPerYear = totalYears >= 5 ? 30 : 21;

  const yearsCompleted = Math.floor(totalYears);
  const serviceYearStart = new Date(hire);
  serviceYearStart.setFullYear(hire.getFullYear() + yearsCompleted);
  if (serviceYearStart > now) serviceYearStart.setFullYear(serviceYearStart.getFullYear() - 1);

  const daysElapsed = Math.max(0, (now - serviceYearStart) / DAY_MS);
  const accrued = Math.min(entitlementPerYear, (entitlementPerYear * daysElapsed) / 365);
  const used = Number(usedDaysThisServiceYear) || 0;
  const remaining = Math.round((accrued - used) * 100) / 100;

  return {
    entitlementPerYear,
    serviceYearStart: serviceYearStart.toISOString().slice(0, 10),
    accrued: Math.round(accrued * 100) / 100,
    used,
    remaining,
  };
}

// Sick leave pay tiers (Art. 17): first 30 days/year full pay, next 60 days
// at 3/4 pay, next 30 days unpaid — 120 days total in the rolling "sick
// year" that starts from the date of the employee's first sick leave.
function allocateSickDays(priorUsedDays, newDays) {
  let remaining = newDays;
  let cursor = Math.max(0, Number(priorUsedDays) || 0);
  let full = 0, threeQuarter = 0, unpaid = 0;
  while (remaining > 0) {
    if (cursor < 30) {
      const take = Math.min(remaining, 30 - cursor);
      full += take; cursor += take; remaining -= take;
    } else if (cursor < 90) {
      const take = Math.min(remaining, 90 - cursor);
      threeQuarter += take; cursor += take; remaining -= take;
    } else {
      unpaid += remaining;
      remaining = 0;
    }
  }
  const paidDays = Math.round((full + threeQuarter * 0.75) * 100) / 100;
  const unpaidDays = Math.round((unpaid + threeQuarter * 0.25) * 100) / 100;
  return { full, threeQuarter, unpaid, paidDays, unpaidDays };
}

// Fixed statutory caps for the occasion leave types (Art. 40, 44). Types not
// listed here (exam, unpaid, other) have no fixed system-enforced cap.
const OCCASION_LEAVE_MAX_DAYS = {
  marriage: 5,
  birth: 3,
  death: 5,
  hajj: 10,
  iddah_muslim: 130, // 4 months + 10 days
  iddah_nonmuslim: 15,
};

module.exports = { calcAnnualLeaveBalance, allocateSickDays, OCCASION_LEAVE_MAX_DAYS };
