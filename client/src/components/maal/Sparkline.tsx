export function Sparkline({
  data,
  width = 120,
  height = 32,
  positive = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const points = data.map((v, i) => {
    const x = i * step;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path = `M ${points.join(" L ")}`;
  const stroke = positive ? "var(--mint)" : "var(--foreground)";
  return (
    <svg width={width} height={height} className="block" viewBox={`0 0 ${width} ${height}`}>
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        style={{
          strokeDasharray: 1,
          strokeDashoffset: 1,
          animation: "spark-draw 1.1s cubic-bezier(0.16,1,0.3,1) forwards",
        }}
      />
      <style>{`@keyframes spark-draw{to{stroke-dashoffset:0}}`}</style>
    </svg>
  );
}