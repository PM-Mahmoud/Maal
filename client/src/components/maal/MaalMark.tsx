// Maal brandmark — 7×7 pixel-grid "M" (matches public/images/maal-mark.svg).
// Gold (#C9A84C): full left/right columns + cells (1,1) and (5,1).
// Forest (#0A2918): cells (2,2), (3,3), (4,2). Dark variant uses #E2C06A / #1A4D2E.
export function MaalMark({
  size = 20,
  theme = "light",
  className,
}: {
  size?: number;
  theme?: "light" | "dark";
  className?: string;
}) {
  const gold = theme === "dark" ? "#E2C06A" : "#C9A84C";
  const forest = theme === "dark" ? "#1A4D2E" : "#0A2918";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      <g fill={gold}>
        <rect x="0" y="0" width="1" height="7" />
        <rect x="6" y="0" width="1" height="7" />
        <rect x="1" y="1" width="1" height="1" />
        <rect x="5" y="1" width="1" height="1" />
      </g>
      <g fill={forest}>
        <rect x="2" y="2" width="1" height="1" />
        <rect x="3" y="3" width="1" height="1" />
        <rect x="4" y="2" width="1" height="1" />
      </g>
    </svg>
  );
}
