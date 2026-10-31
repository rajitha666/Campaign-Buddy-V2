// Remembers which campaign a user last had selected, so a reload doesn't drop
// them back on the first campaign alphabetically. Keyed by user id so two
// people sharing a browser never inherit each other's choice, and always
// validated against the caller's own campaign list (their access grants), so a
// stale, revoked or foreign id is ignored rather than trusted.
const KEY = (userId) => `cb_campaign:${userId}`;

export function readCampaignChoice(userId) {
  if (!userId) return null;
  try { return localStorage.getItem(KEY(userId)) || null; } catch { return null; }
}

export function writeCampaignChoice(userId, campaignId) {
  if (!userId) return;
  try {
    if (campaignId) localStorage.setItem(KEY(userId), campaignId);
    else localStorage.removeItem(KEY(userId));
  } catch { /* storage unavailable — choice just won't persist */ }
}

// Prefer the remembered campaign when the user can still access it; otherwise
// the first in the list (the list is already sorted by name).
export function pickCampaign(list, rememberedId) {
  if (rememberedId && (list || []).some((c) => c.id === rememberedId)) return rememberedId;
  return list?.[0]?.id || null;
}
