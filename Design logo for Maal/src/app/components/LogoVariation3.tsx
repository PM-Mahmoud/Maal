// Logo Variation 3: Soft Neutrals + Accent - Minimalist M Coin
// Soft gray with coral accent
// Clean modern sans-serif

interface LogoProps {
  size?: 'small' | 'medium' | 'large' | 'icon';
  variant?: 'full' | 'icon';
}

export function LogoVariation3({ size = 'medium', variant = 'full' }: LogoProps) {
  const sizeClasses = {
    small: 'h-8',
    medium: 'h-12',
    large: 'h-16',
    icon: 'h-12 w-12'
  };

  const iconSize = {
    small: 32,
    medium: 48,
    large: 64,
    icon: 48
  };

  const currentSize = iconSize[size];

  return (
    <div className={`flex items-center gap-2 ${sizeClasses[size]}`}>
      {/* Minimalist Coin with M */}
      <svg
        width={currentSize}
        height={currentSize}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Gradient background circle */}
        <defs>
          <linearGradient id="grad3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#374151', stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: '#1F2937', stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        
        <circle cx="24" cy="24" r="22" fill="url(#grad3)"/>
        
        {/* Stacked M design */}
        <path
          d="M15 28V18M15 18L20 24L24 18L28 24L33 18M33 18V28"
          stroke="#FF6B6B"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Accent dot */}
        <circle cx="24" cy="30" r="1.5" fill="#FF6B6B"/>
      </svg>
      
      {variant === 'full' && (
        <div className="flex flex-col justify-center">
          <span className="font-semibold tracking-tight" style={{ color: '#1F2937', fontSize: currentSize * 0.45 }}>
            Maal
          </span>
          <span className="text-xs tracking-wide" style={{ color: '#FF6B6B', fontSize: currentSize * 0.2 }}>
            hello wealth
          </span>
        </div>
      )}
    </div>
  );
}
