// Swaps the word "Promoter"/"Promoters" (any case) for a campaign's configured
// designation label (e.g. "Beauty Advisor"). Same rules as the portal's
// applyDesignationLabel: the label's first letter is lowercased when the
// original word was lowercase, and "Promotion" etc. are left alone.
export function applyDesignationLabel(text: string, label?: string | null): string {
  if (!label) return text;
  return text.replace(/\bPromoters?\b/gi, (match) => {
    const isPlural = /s$/i.test(match);
    const isLower = match[0] === match[0].toLowerCase() && match[0] !== match[0].toUpperCase();
    const replacement = isPlural ? `${label}s` : label;
    return isLower ? replacement.charAt(0).toLowerCase() + replacement.slice(1) : replacement;
  });
}
