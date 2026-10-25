export function AdSlot({ mobile = false }: { mobile?: boolean }) {
  return (
    <aside
      className={`ad-slot ${mobile ? "mobile" : ""}`}
      aria-label="Advertisement placeholder"
    >
      ADVERTISEMENT • {mobile ? "320 × 100" : "300 × 250"}
    </aside>
  );
}
