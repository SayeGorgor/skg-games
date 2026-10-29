export function SKGLogo() {
  return (
    <svg
      className="skg-logo"
      viewBox="0 0 230 46"
      role="img"
      aria-label="SKG Games"
    >
      {/* Three-dot mark */}
      <circle cx="11" cy="9" r="5.5" fill="var(--coral)" />
      <circle cx="5.5" cy="23" r="5.5" fill="var(--gold)" />
      <circle cx="16.5" cy="23" r="5.5" fill="var(--blue)" />

      {/* SKG */}
      <text
        x="31"
        y="31"
        fontFamily='"Array Wide", Arial, sans-serif'
        fontSize="40"
        fontWeight="400"
      >
        <tspan fill="var(--coral)">S</tspan>
        <tspan fill="var(--gold)">K</tspan>
        <tspan fill="var(--blue)">G</tspan>
      </text>

      {/* GAMES */}
      <text
        x="109"
        y="31"
        fontFamily='"Satoshi Regular", Arial, sans-serif'
        fontSize="32.5"
        fontWeight="500"
        fill="currentColor"
      >
        GAMES
      </text>
    </svg>
  );
}