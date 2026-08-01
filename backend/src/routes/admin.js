// Platform-level administration for the super admin (system owner): see and
// manage every company in the system, create new companies on behalf of
// clients, and grant/revoke an external user's access to any specific
// company without needing to be a member of it themselves.
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');
const { ROLES } = require('../permissions');

const router = express.Router();
router.use(requireAuth, requireSuperAdmin);

router.get('/companies', async (req, res) => {
  const companies = await db('companies').select('id', 'name_ar as nameAr', 'name_en as nameEn', 'created_at as createdAt');
  const userCounts = await db('user_company_roles').count('* as count').select('company_id as companyId').groupBy('company_id');
  const employeeCounts = await db('employees').count('* as count').select('company_id as companyId').groupBy('company_id');
  const owners = await db('user_company_roles')
    .join('users', 'users.id', 'user_company_roles.user_id')
    .where('user_company_roles.role', 'owner')
    .select('user_company_roles.company_id as companyId', 'users.email', 'users.full_name as fullName');

  const userCountMap = Object.fromEntries(userCounts.map((r) => [r.companyId, Number(r.count)]));
  const employeeCountMap = Object.fromEntries(employeeCounts.map((r) => [r.companyId, Number(r.count)]));
  const ownersMap = {};
  owners.forEach((o) => { (ownersMap[o.companyId] ||= []).push({ email: o.email, fullName: o.fullName }); });

  res.json(companies.map((c) => ({
    ...c,
    userCount: userCountMap[c.id] || 0,
    employeeCount: employeeCountMap[c.id] || 0,
    owners: ownersMap[c.id] || [],
  })));
});

router.post('/companies', async (req, res) => {
  const { nameAr, nameEn, ownerEmail, ownerFullName, ownerPassword } = req.body || {};
  if (!nameAr) return res.status(400).json({ error: 'nameAr is required' });

  const result = await db.transaction(async (trx) => {
    const companyId = await db.insertReturningId(trx, 'companies', { name_ar: nameAr, name_en: nameEn || nameAr });

    if (ownerEmail) {
      let owner = await trx('users').where({ email: String(ownerEmail).toLowerCase() }).first();
      if (!owner) {
        if (!ownerFullName || !ownerPassword) {
          throw Object.assign(new Error('New owner: ownerFullName and ownerPassword are required'), { status: 400 });
        }
        if (String(ownerPassword).length < 8) {
          throw Object.assign(new Error('Password must be at least 8 characters'), { status: 400 });
        }
        const passwordHash = await bcrypt.hash(ownerPassword, 12);
        const ownerId = await db.insertReturningId(trx, 'users', {
          email: String(ownerEmail).toLowerCase(),
          password_hash: passwordHash,
          full_name: ownerFullName,
        });
        owner = { id: ownerId };
      }
      await trx('user_company_roles').insert({ user_id: owner.id, company_id: companyId, role: 'owner' });
    }
    return companyId;
  });

  res.status(201).json({ id: result, nameAr, nameEn: nameEn || nameAr });
});

router.get('/companies/:companyId/users', async (req, res) => {
  const rows = await db('user_company_roles')
    .join('users', 'users.id', 'user_company_roles.user_id')
    .where('user_company_roles.company_id', Number(req.params.companyId))
    .select('users.id', 'users.email', 'users.full_name as fullName', 'user_company_roles.role');
  res.json(rows);
});

// Grants a user (existing or brand new, identified by email) a role on a
// company — the super admin does not need to already be a member of it.
router.post('/companies/:companyId/access', async (req, res) => {
  const companyId = Number(req.params.companyId);
  const { email, role, fullName, password } = req.body || {};
  if (!email || !role) return res.status(400).json({ error: 'email and role are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });

  const company = await db('companies').where({ id: companyId }).first();
  if (!company) return res.status(404).json({ error: 'Company not found' });

  let user = await db('users').where({ email: String(email).toLowerCase() }).first();
  if (!user) {
    if (!password || !fullName) {
      return res.status(400).json({ error: 'New user: fullName and password are required' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await db.insertReturningId(db, 'users', {
      email: String(email).toLowerCase(),
      password_hash: passwordHash,
      full_name: fullName,
    });
    user = { id: userId, email: String(email).toLowerCase(), full_name: fullName };
  }

  const existingRole = await db('user_company_roles').where({ user_id: user.id, company_id: companyId }).first();
  if (existingRole) {
    await db('user_company_roles').where({ user_id: user.id, company_id: companyId }).update({ role, updated_at: new Date() });
    return res.json({ id: user.id, email: user.email, fullName: user.full_name, role, updated: true });
  }

  await db('user_company_roles').insert({ user_id: user.id, company_id: companyId, role });
  res.status(201).json({ id: user.id, email: user.email, fullName: user.full_name, role });
});

router.delete('/companies/:companyId/access/:userId', async (req, res) => {
  await db('user_company_roles')
    .where({ user_id: Number(req.params.userId), company_id: Number(req.params.companyId) })
    .delete();
  res.json({ ok: true });
});

module.exports = router;
