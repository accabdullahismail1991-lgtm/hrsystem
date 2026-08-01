// Ported from the original single-file app's calcEmp/calcServiceDuration/
// calcKsaEos/calcMonthlyAccrual so payroll and EOS numbers match exactly
// what the original tool produced. Kept as pure functions (no I/O).

function calcPayrollLine(line, workDays) {
  const wd = Math.max(1, workDays || 30);
  const absent = Math.min(line.absentDays || 0, wd);
  const present = wd - absent;

  const basic = Number(line.basic) || 0;
  const housing = Number(line.housing) || 0;
  const transport = Number(line.transport) || 0;
  const other = Number(line.other) || 0;
  const overtime = Number(line.overtime) || 0;
  const bonus = Number(line.bonus) || 0;

  const totalSalaryBase = basic + housing + transport + other;
  const absenceDeduction = absent > 0 ? Math.round((totalSalaryBase / wd) * absent) : 0;
  const dueSalaryBase = totalSalaryBase - absenceDeduction;
  const grossPay = dueSalaryBase + overtime + bonus;

  const gosiEmp = Number(line.gosiEmp) || 0;
  const healthIns = Number(line.healthIns) || 0;
  const incomeTax = Number(line.incomeTax) || 0;
  const unionFee = Number(line.unionFee) || 0;
  const advanceDeduction = Number(line.advanceDeduction) || 0;
  const otherDeduction = Number(line.otherDeduction) || 0;

  const totalDeductions = gosiEmp + healthIns + incomeTax + unionFee + advanceDeduction + otherDeduction;
  const netPay = grossPay - totalDeductions;

  const gosiEr = Number(line.gosiEr) || 0;
  const otherEr = Number(line.otherEr) || 0;
  const employerCost = grossPay + gosiEr + otherEr;

  return { absent, present, absenceDeduction, grossPay, totalDeductions, netPay, employerCost };
}

function calcServiceDuration(hireDate, endDate) {
  if (!hireDate || !endDate) return { years: 0, months: 0, days: 0, totalMonths: 0, totalDays: 0 };
  const h = new Date(hireDate);
  const e = new Date(endDate);
  if (e <= h) return { years: 0, months: 0, days: 0, totalMonths: 0, totalDays: 0 };

  let years = e.getFullYear() - h.getFullYear();
  let months = e.getMonth() - h.getMonth();
  let days = e.getDate() - h.getDate();

  if (days < 0) {
    months--;
    const prevMonth = new Date(e.getFullYear(), e.getMonth(), 0);
    days += prevMonth.getDate();
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  const totalDays = Math.floor((e - h) / (1000 * 60 * 60 * 24));
  const totalMonths = years * 12 + months + (days >= 15 ? 1 : 0);
  return { years, months, days, totalDays, totalMonths };
}

// KSA Labor Law end-of-service gratuity (Art. 84 resignation / Art. 87 termination).
function calcKsaEos(basic, housing, hireDate, endDate, reason) {
  const basis = (Number(basic) || 0) + (Number(housing) || 0);
  const dailyRate = basis / 30;
  const dur = calcServiceDuration(hireDate, endDate);
  const { years, months, days, totalMonths } = dur;

  let gratuity = 0;
  let ruleApplied = '';

  if (reason === 'resigned') {
    if (totalMonths < 24) {
      gratuity = 0;
      ruleApplied = 'Art. 84 — Less than 2 years → No entitlement';
    } else {
      const partialFrac = (months + (days >= 15 ? 1 : 0)) / 12;
      let tier;
      if (years < 5) {
        tier = 1 / 3;
        ruleApplied = 'Art. 84 — 2–5 yrs → ⅓ × (10-day wage × years)';
      } else if (years < 10) {
        tier = 2 / 3;
        ruleApplied = 'Art. 84 — 5–10 yrs → ⅔ × (10-day wage × years)';
      } else {
        tier = 1;
        ruleApplied = 'Art. 84 — 10+ yrs → Full 10-day wage × years';
      }
      const yearsDecimal = years + partialFrac;
      gratuity = Math.round(dailyRate * 10 * yearsDecimal * tier);
    }
  } else {
    const fullYears = years;
    const partialMonths = months + (days >= 15 ? 1 : 0);
    const tier1Years = Math.min(fullYears, 5);
    const tier2Years = Math.max(fullYears - 5, 0);
    const g1 = tier1Years * basis * 0.5;
    const g2 = tier2Years * basis * 1.0;
    const gPartial = partialMonths > 0 ? (partialMonths / 12) * basis * (fullYears < 5 ? 0.5 : 1.0) : 0;
    gratuity = Math.round(g1 + g2 + gPartial);
    ruleApplied = 'Art. 87 — ½ month (≤5 yrs) + 1 month (>5 yrs) per year';
  }

  return { gratuity, ruleApplied, basis, dailyRate, dur };
}

function calcMonthlyAccrual(basic, housing, totalMonths) {
  const basis = (Number(basic) || 0) + (Number(housing) || 0);
  if (totalMonths <= 0) return 0;
  const years = totalMonths / 12;
  const tier1Y = Math.min(years, 5);
  const tier2Y = Math.max(years - 5, 0);
  const totalGratuity = tier1Y * basis * 0.5 + tier2Y * basis;
  return totalGratuity / totalMonths;
}

module.exports = { calcPayrollLine, calcServiceDuration, calcKsaEos, calcMonthlyAccrual };
