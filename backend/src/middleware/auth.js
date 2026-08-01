const jwt = require('jsonwebtoken');
const db = require('../db');
const { can } = require('../permissions');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable must be set (see .env.example)');
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '12h' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Resolves the caller's role for :companyId and rejects if they have none —
// this is what stops a valid, logged-in user from ever touching a company
// they are not a member of, regardless of what id they put in the URL.
function requireCompanyRole(action) {
  return async (req, res, next) => {
    const companyId = Number(req.params.companyId);
    if (!companyId) return res.status(400).json({ error: 'companyId is required' });
    const membership = await db('user_company_roles')
      .where({ user_id: req.userId, company_id: companyId })
      .first();
    if (!membership) return res.status(403).json({ error: 'Not a member of this company' });
    if (action && !can(membership.role, action)) {
      return res.status(403).json({ error: `Role '${membership.role}' cannot perform '${action}'` });
    }
    req.companyId = companyId;
    req.role = membership.role;
    next();
  };
}

module.exports = { signToken, requireAuth, requireCompanyRole, JWT_SECRET };
