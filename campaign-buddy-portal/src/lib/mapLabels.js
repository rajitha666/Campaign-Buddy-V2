// Screen-reader name for a staff marker on the live map.
export function staffMarkerLabel({ staffName, outletName, approx }) {
  return `${staffName}${outletName ? `, ${outletName}` : ''}${approx ? ' (approximate position)' : ''}`;
}
