// Logo Variation 2: Premium & Sophisticated - Dollar Bill with M
// Emerald green with gold accent
// Serif typography

interface LogoProps {
  size?: 'small' | 'medium' | 'large' | 'icon';
  variant?: 'full' | 'icon';
}

export function LogoVariation2({ size = 'medium', variant = 'full' }: LogoProps) {
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
    <div className={`flex items-center gap-3 ${sizeClasses[size]}`}>
      {/* Dollar Bill Icon with M */}
      <svg
        width={currentSize}
        height={currentSize * 0.7}
        viewBox="0 0 48 34"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Bill background */}
        <rect x="2" y="2" width="44" height="30" rx="3" fill="#064E3B" stroke="#D4AF37" strokeWidth="1.5"/>
        
        {/* Decorative corners */}
        <circle cx="8" cy="8" r="2" fill="#D4AF37" opacity="0.4"/>
        <circle cx="40" cy="8" r="2" fill="#D4AF37" opacity="0.4"/>
        <circle cx="8" cy="26" r="2" fill="#D4AF37" opacity="0.4"/>
        <circle cx="40" cy="26" r="2" fill="#D4AF37" opacity="0.4"/>
        
        {/* M in center */}
        <path
          d="M16 22V12L20 17L24 12L28 17L32 12V22"
          stroke="#D4AF37"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        
        {/* Decorative lines */}
        <line x1="14" y1="24" x2="34" y2="24" stroke="#D4AF37" strokeWidth="0.5" opacity="0.3"/>
        <line x1="14" y1="10" x2="34" y2="10" stroke="#D4AF37" strokeWidth="0.5" opacity="0.3"/>
      </svg>
      
      {variant === 'full' && (
        <div className="flex flex-col justify-center">
          <span className="font-serif font-bold tracking-tight" style={{ color: '#064E3B', fontSize: currentSize * 0.5 }}>
            Maal
          </span>
          <span className="text-xs tracking-widest uppercase opacity-50" style={{ color: '#064E3B', fontSize: currentSize * 0.18 }}>
            Wealth · Growth
          </span>
        </div>
      )}
    </div>
  );
}
