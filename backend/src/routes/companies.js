const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireCompanyRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Companies the current user belongs to.
router.get('/', async (req, res) => {
  const rows = await db('user_company_roles')
    .join('companies', 'companies.id', 'user_company_roles.company_id')
    .where('user_company_roles.user_id', req.userId)
    .select('companies.id', 'companies.name_ar as nameAr', 'companies.name_en as nameEn', 'user_company_roles.role');
  res.json(rows);
});

// Any logged-in user may create a new company; they become its owner.
router.post('/', async (req, res) => {
  const { nameAr, nameEn } = req.body || {};
  if (!nameAr) return res.status(400).json({ error: 'nameAr is required' });
  const companyId = await db.transaction(async (trx) => {
    const id = await db.insertReturningId(trx, 'companies', { name_ar: nameAr, name_en: nameEn || nameAr });
    await trx('user_company_roles').insert({ user_id: req.userId, company_id: id, role: 'owner' });
    return id;
  });
  res.status(201).json({ id: companyId, nameAr, nameEn: nameEn || nameAr, role: 'owner' });
});

function parseSignatures(v) {
  if (!v) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

router.get('/:companyId', requireCompanyRole('view'), async (req, res) => {
  const company = await db('companies').where({ id: req.companyId }).first();
  if (!company) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: company.id, nameAr: company.name_ar, nameEn: company.name_en,
    logoDataUrl: company.logo_data_url, signatures: parseSignatures(company.signatures), role: req.role,
  });
});

router.patch('/:companyId', requireCompanyRole('manageCompanySettings'), async (req, res) => {
  const { nameAr, nameEn, logoDataUrl, signatures } = req.body || {};
  const patch = {};
  if (nameAr !== undefined) patch.name_ar = nameAr;
  if (nameEn !== undefined) patch.name_en = nameEn;
  if (logoDataUrl !== undefined) patch.logo_data_url = logoDataUrl;
  if (signatures !== undefined) patch.signatures = JSON.stringify(signatures || []);
  patch.updated_at = new Date();
  await db('companies').where({ id: req.companyId }).update(patch);
  res.json({ ok: true });
});

// --- Company users & roles (owner only) ---

router.get('/:companyId/users', requireCompanyRole('manageUsers'), async (req, res) => {
  const rows = await db('user_company_roles')
    .join('users', 'users.id', 'user_company_roles.user_id')
    .where('user_company_roles.company_id', req.companyId)
    .select('users.id', 'users.email', 'users.full_name as fullName', 'user_company_roles.role');
  res.json(rows);
});

// Adds an existing user (by email) to this company with a role, or
// creates the user first if they don't exist yet.
router.post('/:companyId/users', requireCompanyRole('manageUsers'), async (req, res) => {
  const { email, role, fullName, password } = req.body || {};
  const { ROLES } = require('../permissions');
  if (!email || !role) return res.status(400).json({ error: 'email and role are required' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });

  let user = await db('users').where({ email: String(email).toLowerCase() }).first();
  if (!user) {
    if (!password || !fullName) {
      return res.status(400).json({ error: 'New user: fullName and password are required' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const userId = await db.insertReturningId(db, 'users', {
      email: String(email).toLowerCase(),
      password_hash: passwordHash,
      full_name: fullName,
    });
    user = { id: userId, email: String(email).toLowerCase(), full_name: fullName };
  }

  const existingRole = await db('user_company_roles').where({ user_id: user.id, company_id: req.companyId }).first();
  if (existingRole) return res.status(409).json({ error: 'User already has a role in this company' });

  await db('user_company_roles').insert({ user_id: user.id, company_id: req.companyId, role });
  res.status(201).json({ id: user.id, email: user.email, fullName: user.full_name, role });
});

router.patch('/:companyId/users/:userId', requireCompanyRole('manageUsers'), async (req, res) => {
  const { role } = req.body || {};
  const { ROLES } = require('../permissions');
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of ${ROLES.join(', ')}` });
  const updated = await db('user_company_roles')
    .where({ user_id: Number(req.params.userId), company_id: req.companyId })
    .update({ role, updated_at: new Date() });
  if (!updated) return res.status(404).json({ error: 'That user has no role in this company' });
  res.json({ ok: true });
});

router.delete('/:companyId/users/:userId', requireCompanyRole('manageUsers'), async (req, res) => {
  const targetId = Number(req.params.userId);
  if (targetId === req.userId) return res.status(400).json({ error: 'Cannot remove your own access' });
  await db('user_company_roles').where({ user_id: targetId, company_id: req.companyId }).delete();
  res.json({ ok: true });
});

module.exports = router;
