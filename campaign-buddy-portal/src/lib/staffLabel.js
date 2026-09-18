// Canonical way to show a Promoter/Supervisor anywhere in the portal — every
// staff-picking dropdown and table column that renders a staff label uses this
// so the format stays identical everywhere: just the person's name. Employee
// IDs stay in the database, the staff form and the profile page only.
export function staffLabel(s) {
  if (!s) return '';
  const name = s.fullName || s.displayName || s.id;
  return name;
}
