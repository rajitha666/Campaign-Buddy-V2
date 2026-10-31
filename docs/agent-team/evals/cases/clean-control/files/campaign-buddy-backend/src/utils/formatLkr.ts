/** Format a whole-rupee amount for reports, e.g. 1250000 -> "Rs 1,250,000". Negative values keep the sign in front. */
export function formatLkr(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded < 0 ? "-" : "";
  return `${sign}Rs ${Math.abs(rounded).toLocaleString("en-US")}`;
}
