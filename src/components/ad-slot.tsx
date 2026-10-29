"use client";
import { useViewer } from "./auth/viewer-provider";
export function AdSlot({ mobile = false }: { mobile?: boolean }) {
  const { viewer } = useViewer();
  if (viewer.premium) return null;
  return (
    <aside
      className={`ad-slot ${mobile ? "mobile" : ""}`}
      aria-label="Advertisement placeholder"
    >
      ADVERTISEMENT • {mobile ? "320 × 100" : "300 × 250"}
    </aside>
  );
}
