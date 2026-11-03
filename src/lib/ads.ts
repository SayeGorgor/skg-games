// Resolve on the server and pass to clients so navigation and placements agree.
export function adsEnabled() {
  return process.env.NEXT_PUBLIC_ADS_ENABLED === "true";
}
