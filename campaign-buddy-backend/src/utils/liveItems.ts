// #111 — "live" product filters. Removing a product from a campaign or an
// activation is a soft delete (`deletedAt`); removed products drop out of
// setup screens and live product lists but their sales history stays counted
// (reports, exports and target progress deliberately do NOT use these).

/** CampaignItem that has not been removed from its campaign (and whose Item is live). */
export const liveCampaignItem = { deletedAt: null, item: { deletedAt: null } } as const;

/** ActivationItem that is still on its activation, campaign and catalogue. */
export const liveActivationItem = {
  deletedAt: null,
  campaignItem: { deletedAt: null, item: { deletedAt: null } },
} as const;
