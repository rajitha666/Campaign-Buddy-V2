// Canonical way to show a Promoter/Supervisor anywhere in the portal — every
// staff-picking dropdown uses this so the format stays identical everywhere:
// "EMP-0004 - Tharindu Perera". ID first so entries with similar names stay
// distinguishable once the roster grows.
export function staffLabel(s) {
  if (!s) return '';
  const name = s.fullName || s.displayName || s.id;
  return s.employeeId ? `${s.employeeId} - ${name}` : name;
}
