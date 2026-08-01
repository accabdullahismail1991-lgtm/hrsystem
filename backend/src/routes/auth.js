const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Emails listed here are auto-promoted to super admin (platform owner) the
// next time they register or log in. This is how the very first super
// admin gets bootstrapped without needing direct DB access.
const SUPER_ADMIN_EMAILS = String(process.env.SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function syncSuperAdminFlag(user) {
  const shouldBeSuperAdmin = SUPER_ADMIN_EMAILS.includes(user.email);
  if (shouldBeSuperAdmin && !user.is_super_admin) {
    await db('users').where({ id: user.id }).update({ is_super_admin: true });
    user.is_super_admin = true;
  }
  return user;
}

router.post('/register', async (req, res) => {
  const { companyNameAr, companyNameEn, email, password, fullName } = req.body || {};
  if (!companyNameAr || !email || !password || !fullName) {
    return res.status(400).json({ error: 'companyNameAr, email, password, fullName are required' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const existing = await db('users').where({ email: email.toLowerCase() }).first();
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const passwordHash = await bcrypt.hash(password, 12);

  const result = await db.transaction(async (trx) => {
    const companyId = await db.insertReturningId(trx, 'companies', {
      name_ar: companyNameAr,
      name_en: companyNameEn || companyNameAr,
    });
    const userId = await db.insertReturningId(trx, 'users', {
      email: email.toLowerCase(),
      password_hash: passwordHash,
      full_name: fullName,
    });
    await trx('user_company_roles').insert({ user_id: userId, company_id: companyId, role: 'owner' });
    return { companyId, userId };
  });

  let user = { id: result.userId, email: email.toLowerCase(), full_name: fullName, is_super_admin: false };
  user = await syncSuperAdminFlag(user);
  res.status(201).json({
    token: signToken(user),
    user: { id: user.id, email: user.email, full_name: user.full_name, isSuperAdmin: user.is_super_admin },
    companyId: result.companyId,
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

  let user = await db('users').where({ email: String(email).toLowerCase() }).first();
  if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid email or password' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

  user = await syncSuperAdminFlag(user);
  res.json({
    token: signToken(user),
    user: { id: user.id, email: user.email, full_name: user.full_name, isSuperAdmin: user.is_super_admin },
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await db('users').where({ id: req.userId }).first();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const memberships = await db('user_company_roles')
    .join('companies', 'companies.id', 'user_company_roles.company_id')
    .where('user_company_roles.user_id', req.userId)
    .select(
      'companies.id as companyId',
      'companies.name_ar as nameAr',
      'companies.name_en as nameEn',
      'user_company_roles.role'
    );

  res.json({
    user: { id: user.id, email: user.email, full_name: user.full_name, isSuperAdmin: !!user.is_super_admin },
    companies: memberships,
  });
});

module.exports = router;
