// Normalises autofilled/typed phone input (separators, IDD or country-code
// forms) to the canonical local Sri Lankan format the backend stores
// (issue #22) — e.g. "0771234567". Mirrors backend src/utils/phone.ts
// normalizeLkPhone(). A recognizable foreign E.164 number (no local-SL
// representation exists for it) is left as-is — e.g. an emergency contact
// living abroad.
export const normalizePhone = (v) => {
  if (!v) return v;
  const trimmed = String(v).trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return trimmed;

  if (digits.length === 10 && digits.startsWith('0')) return digits; // already local
  if (digits.length === 11 && digits.startsWith('94')) return `0${digits.slice(2)}`; // +94/94 country code
  if (digits.length === 9 && digits.startsWith('7')) return `0${digits}`; // bare 9-digit mobile

  if (trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return trimmed;
};

export const validators = {
  required: (msg = 'Required') => (v) =>
    !v || !v.toString().trim() ? msg : null,

  mobile: (msg) => (v) => {
    if (!v || !v.trim()) return null;
    const n = normalizePhone(v);
    if (/^0\d{9}$/.test(n) || /^\+\d{10,15}$/.test(n)) return null;
    return msg || 'Enter a valid mobile number (e.g. 0771234567)';
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
