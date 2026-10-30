"use client";
import { useViewer } from "./auth/viewer-provider";

// Temporary site-wide pause. Set to true to restore existing ad placements.
const ADS_ENABLED = false;

export function AdSlot({
  mobile = false,
  placement = "default",
}: {
  mobile?: boolean;
  placement?: "default" | "post-gameplay";
}) {
  const { viewer } = useViewer();
  if (!ADS_ENABLED || viewer.premium) return null;
  if (placement === "post-gameplay") {
    return (
      <aside className="stack-ad-region" aria-label="Advertisement placeholder">
        <div className="stack-ad-inner">
          <div className="ad-slot stack-ad-slot">ADVERTISEMENT</div>
        </div>
      </aside>
    );
  }
  return (
    <aside
      className={`ad-slot ${mobile ? "mobile" : ""}`}
      aria-label="Advertisement placeholder"
    >
      ADVERTISEMENT • {mobile ? "320 × 100" : "300 × 250"}
    </aside>
  );
}
