// Logo Variation 1: $50 Note — flat, futuristic, black & white

interface LogoProps {
  size?: 'small' | 'medium' | 'large' | 'icon';
  variant?: 'full' | 'icon';
}

// Portrait section only — used for icon variant (square crop of the face)
function NotePortrait({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="108 3 52 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="108" y="3" width="52" height="64" fill="#0D0D0D"/>
      <rect x="108" y="3" width="52" height="64" fill="none" stroke="white" strokeWidth="0.75"/>
      {/* Face oval */}
      <ellipse cx="132" cy="27" rx="15" ry="18" fill="white"/>
      {/* Hair cap */}
      <path d="M117 22 Q117 7 132 6 Q147 7 147 22 Q140 15 132 14 Q124 15 117 22Z" fill="#0D0D0D"/>
      {/* Ears */}
      <ellipse cx="117" cy="27" rx="2.5" ry="4.5" fill="white"/>
      <ellipse cx="147" cy="27" rx="2" ry="4" fill="white"/>
      {/* Eyes */}
      <ellipse cx="126" cy="24" rx="2.8" ry="2" fill="#0D0D0D"/>
      <ellipse cx="138" cy="24" rx="2.8" ry="2" fill="#0D0D0D"/>
      {/* Nose */}
      <path d="M130 28 L129 32 Q132 33.5 135 32 L134 28" stroke="#0D0D0D" strokeWidth="0.7" fill="none" strokeLinejoin="round"/>
      {/* Mouth */}
      <path d="M127 36 Q132 39.5 137 36" stroke="#0D0D0D" strokeWidth="1" fill="none" strokeLinecap="round"/>
      {/* Neck */}
      <rect x="129" y="45" width="6" height="8" fill="white"/>
      {/* Jacket shoulders */}
      <path d="M110 67 L117 46 Q125 43 129 45 L128 54 L124 67Z" fill="white"/>
      <path d="M154 67 L147 46 Q139 43 135 45 L136 54 L140 67Z" fill="white"/>
      {/* Lapels */}
      <path d="M117 67 L122 53 L129 45 L126 53 L121 67Z" fill="#0D0D0D"/>
      <path d="M147 67 L142 53 L135 45 L138 53 L143 67Z" fill="#0D0D0D"/>
      {/* Shirt */}
      <path d="M126 53 L132 57 L138 53 L135 45 L129 45Z" fill="white"/>
      {/* Hologram circle */}
      <circle cx="151" cy="60" r="4" fill="none" stroke="white" strokeWidth="0.7" opacity="0.7"/>
      <circle cx="151" cy="60" r="1.5" fill="white" opacity="0.7"/>
    </svg>
  );
}

export function LogoVariation1({ size = 'medium', variant = 'full' }: LogoProps) {
  const noteW = { small: 120, medium: 180, large: 240, icon: 60 };
  const noteH = { small: 52, medium: 78, large: 105, icon: 60 };

  if (variant === 'icon') {
    return <NotePortrait size={noteH[size]}/>;
  }

  const w = noteW[size];
  const h = noteH[size];

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 160 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* ── BILL BODY ── */}
      <rect x="0.5" y="0.5" width="159" height="69" rx="3" fill="#0D0D0D"/>
      <rect x="0.5" y="0.5" width="159" height="69" rx="3" fill="none" stroke="white" strokeWidth="0.75"/>
      {/* Inner border rule */}
      <rect x="3" y="3" width="154" height="64" rx="2" fill="none" stroke="white" strokeWidth="0.3" opacity="0.3"/>

      {/* ── LEFT SECURITY STRIP ── */}
      {Array.from({ length: 21 }, (_, i) => (
        <line key={i} x1="4" y1={4 + i * 3} x2="26" y2={4 + i * 3}
          stroke="white" strokeWidth="0.45" opacity="0.28"/>
      ))}
      {/* Vertical divider */}
      <line x1="27" y1="3" x2="27" y2="67" stroke="white" strokeWidth="0.4" opacity="0.25"/>

      {/* ── CENTRE — FIFTY DOLLARS label ── */}
      <text x="67" y="14" fontSize="5" fontFamily="monospace" fill="white"
        textAnchor="middle" letterSpacing="2" opacity="0.55">FIFTY DOLLARS</text>

      {/* ── "50" NUMERAL ── */}
      <text x="67" y="50" fontSize="40" fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="bold" fill="white" textAnchor="middle">50</text>

      {/* ── AUSTRALIA ── */}
      <text x="67" y="63" fontSize="5" fontFamily="monospace" fill="white"
        textAnchor="middle" letterSpacing="2.5" opacity="0.55">AUSTRALIA</text>

      {/* ── SECURITY THREAD ── */}
      <line x1="97" y1="3" x2="97" y2="67" stroke="white" strokeWidth="0.8" opacity="0.1"/>
      {[8, 18, 28, 38, 48, 58].map(y => (
        <line key={y} x1="94" y1={y} x2="100" y2={y} stroke="white" strokeWidth="0.5" opacity="0.15"/>
      ))}

      {/* ── PORTRAIT DIVIDER ── */}
      <line x1="108" y1="3" x2="108" y2="67" stroke="white" strokeWidth="0.4" opacity="0.2"/>

      {/* ── PORTRAIT — FACE ── */}
      {/* Face oval */}
      <ellipse cx="132" cy="27" rx="15" ry="18" fill="white"/>
      {/* Hair cap */}
      <path d="M117 22 Q117 7 132 6 Q147 7 147 22 Q140 15 132 14 Q124 15 117 22Z" fill="#0D0D0D"/>
      {/* Ears */}
      <ellipse cx="117" cy="27" rx="2.5" ry="4.5" fill="white"/>
      <ellipse cx="147" cy="27" rx="2" ry="4" fill="white"/>
      {/* Eyebrows */}
      <path d="M122 19 Q126 17 129 18.5" stroke="#0D0D0D" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
      <path d="M135 18.5 Q138 17 142 19" stroke="#0D0D0D" strokeWidth="0.8" fill="none" strokeLinecap="round"/>
      {/* Eyes */}
      <ellipse cx="126" cy="23" rx="3" ry="2" fill="#0D0D0D"/>
      <ellipse cx="138" cy="23" rx="3" ry="2" fill="#0D0D0D"/>
      {/* Eye highlights */}
      <ellipse cx="127.2" cy="22.3" rx="1" ry="0.7" fill="white" opacity="0.5"/>
      <ellipse cx="139.2" cy="22.3" rx="1" ry="0.7" fill="white" opacity="0.5"/>
      {/* Nose */}
      <path d="M130 27 L129 32 Q132 33.5 135 32 L134 27"
        stroke="#0D0D0D" strokeWidth="0.7" fill="none" strokeLinejoin="round"/>
      {/* Mouth */}
      <path d="M127 36 Q132 39.5 137 36" stroke="#0D0D0D" strokeWidth="1.1" fill="none" strokeLinecap="round"/>
      {/* Neck */}
      <rect x="129" y="45" width="6" height="8" fill="white"/>
      {/* Jacket / shoulders */}
      <path d="M110 70 L117 47 Q125 43 129 45 L128 55 L124 70Z" fill="white"/>
      <path d="M154 70 L147 47 Q139 43 135 45 L136 55 L140 70Z" fill="white"/>
      {/* Lapels */}
      <path d="M117 70 L122 54 L129 45 L126 54 L121 70Z" fill="#0D0D0D"/>
      <path d="M147 70 L142 54 L135 45 L138 54 L143 70Z" fill="#0D0D0D"/>
      {/* Shirt */}
      <path d="M126 54 L132 58 L138 54 L135 45 L129 45Z" fill="white"/>

      {/* ── HOLOGRAM CIRCLE ── */}
      <circle cx="151" cy="59" r="5" fill="none" stroke="white" strokeWidth="0.7" opacity="0.65"/>
      <circle cx="151" cy="59" r="2" fill="white" opacity="0.65"/>
    </svg>
  );
}
