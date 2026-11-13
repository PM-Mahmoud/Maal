// Maal brandmark — 7×7 pixel-grid "M" (matches public/images/maal-mark.svg).
// One colour: it takes the surrounding text colour (currentColor), so it's ink
// on light backgrounds and white on dark ones. `theme` is kept for callers
// that still pass it and forces white when "dark".
export function MaalMark({
  size = 20,
  theme,
  className,
}: {
  size?: number;
  theme?: "light" | "dark";
  className?: string;
}) {
  const fill = theme === "dark" ? "#FFFFFF" : "currentColor";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 7 7"
      shapeRendering="crispEdges"
      className={className}
      aria-hidden="true"
    >
      <g fill={fill}>
        <rect x="0" y="0" width="1" height="7" />
        <rect x="6" y="0" width="1" height="7" />
        <rect x="1" y="1" width="1" height="1" />
        <rect x="5" y="1" width="1" height="1" />
        <rect x="2" y="2" width="1" height="1" />
        <rect x="3" y="3" width="1" height="1" />
        <rect x="4" y="2" width="1" height="1" />
      </g>
    </svg>
  );
}
