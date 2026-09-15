// Normalises autofilled/typed phone input (separators, local 0-prefix,
// IDD or country-code forms) so it matches the backend's strict +\d{10,14}.
export const normalizePhone = (v) => {
  if (!v) return v;
  const digits = String(v).replace(/[\s.()\u2013\u2014-]/g, '');
  if (!/^\+?\d+$/.test(digits)) return v.trim();
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`; // IDD prefix
  if (digits.startsWith('0')) return `+94${digits.slice(1)}`; // local trunk 0
  // bare 9-digit local number (e.g. 772222222) — treat as 0-subscribed local
  if (digits.length === 9) return `+940${digits}`;
  // international number without the + (e.g. 94771234567)
  return `+${digits}`;
};

export const validators = {
  required: (msg = 'Required') => (v) =>
    !v || !v.toString().trim() ? msg : null,

  mobile: (msg) => (v) => {
    if (!v || !v.trim()) return null;
    if (!/^\+\d{10,14}$/.test(v.trim()))
      return msg || 'Invalid format (e.g., +94771234567)';
    return null;
  },

  nic: (msg) => (v) => {
    if (!v || !v.trim()) return null;
    const trimmed = v.trim().toUpperCase();
    if (!/^(\d{9}[VX]|\d{12})$/.test(trimmed))
      return msg || 'Invalid NIC (e.g., 891234567V or 198912345678)';
    return null;
  },

  email: (msg) => (v) => {
    if (!v || !v.trim()) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()))
      return msg || 'Invalid email format';
    return null;
  },

  integer: (msg = 'Enter a whole number') => (v) => {
    if (v === '' || v === null || v === undefined) return null;
    return /^\d+$/.test(String(v).trim()) ? null : msg;
  },

  pattern: (regex, msg) => (v) => {
    if (!v || !v.trim()) return null;
    if (!regex.test(v.trim())) return msg;
    return null;
  },

  compose: (...fns) => (v) => {
    for (const fn of fns) {
      const err = fn(v);
      if (err) return err;
    }
    return null;
  }
};
