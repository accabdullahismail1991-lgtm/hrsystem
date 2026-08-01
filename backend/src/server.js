require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const companiesRoutes = require('./routes/companies');
const employeesRoutes = require('./routes/employees');
const contractorsRoutes = require('./routes/contractors');
const branchesRoutes = require('./routes/branches');
const payrollRoutes = require('./routes/payroll');
const advancesRoutes = require('./routes/advances');
const settlementsRoutes = require('./routes/settlements');
const eosRoutes = require('./routes/eos');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/companies/:companyId/employees', employeesRoutes);
app.use('/api/companies/:companyId/contractors', contractorsRoutes);
app.use('/api/companies/:companyId/branches', branchesRoutes);
app.use('/api/companies/:companyId/payroll-runs', payrollRoutes);
app.use('/api/companies/:companyId/advances', advancesRoutes);
app.use('/api/companies/:companyId/settlements', settlementsRoutes);
app.use('/api/companies/:companyId/eos', eosRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`hrsystem backend listening on :${PORT}`));
}

module.exports = app;
