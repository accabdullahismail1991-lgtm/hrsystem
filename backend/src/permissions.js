// Central place for what each role is allowed to do.
// A user's role is per-company (see user_company_roles), so the same
// person can be "owner" of one company and have no access to another.
const ROLES = ['owner', 'admin', 'hr', 'finance', 'viewer'];

const CAN = {
  manageUsers: ['owner'],
  manageCompanySettings: ['owner', 'admin'],
  manageBranches: ['owner', 'admin'],
  manageEmployees: ['owner', 'admin', 'hr'],
  manageContractors: ['owner', 'admin', 'hr'],
  managePayroll: ['owner', 'admin', 'hr', 'finance'],
  viewFinance: ['owner', 'admin', 'finance'],
  // Any known role may read data scoped to their own company.
  view: ROLES,
};

function can(role, action) {
  const allowed = CAN[action];
  return Array.isArray(allowed) && allowed.includes(role);
}

module.exports = { ROLES, CAN, can };
