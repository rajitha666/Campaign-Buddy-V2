import CampaignMap from './CampaignMap';

// Thin wrapper kept for the pages that pass GET /campaigns/{id}/tracking/live
// rows as `pings`. Real map + markers live in CampaignMap.
export default function LiveMapView({ pings = [], outlets = [], height = 340 }) {
  return <CampaignMap staff={pings} outlets={outlets} height={height} />;
}
