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
