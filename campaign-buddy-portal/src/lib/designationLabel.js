// Swaps the word "Promoter"/"Promoters" (any case) for a campaign's configured
// designation label (client doc F) wherever the portal shows it — e.g.
// "Beauty Advisor" for a client whose field staff carry that title. Case-
// insensitive so it also catches lowercase mid-sentence uses ("a promoter's
// daily sales"), and lowercases the label's own first letter to match when the
// original word was lowercase, so the swap still reads naturally there. Word-
// boundary safe so it never touches an unrelated substring (e.g. "Promotion").
export function applyDesignationLabel(text, label) {
  if (!label || text == null) return text;
  return String(text).replace(/\bPromoters?\b/gi, (match) => {
    const isPlural = /s$/i.test(match);
    const isLower = match[0] === match[0].toLowerCase() && match[0] !== match[0].toUpperCase();
    const replacement = isPlural ? `${label}s` : label;
    return isLower ? replacement.charAt(0).toLowerCase() + replacement.slice(1) : replacement;
  });
}
