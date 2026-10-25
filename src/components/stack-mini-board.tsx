export function StackMiniBoard() {
  const colored: Record<number, string> = {
    0: "blue",
    1: "blue",
    5: "green",
    6: "green",
    10: "coral",
    11: "coral",
    14: "gold",
    15: "gold",
    16: "green",
    17: "green",
  };
  return (
    <div className="mini-grid">
      {Array.from({ length: 24 }, (_, i) => (
        <i key={i} className={colored[i] ?? ""} />
      ))}
    </div>
  );
}
