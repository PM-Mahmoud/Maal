// Logo Variation 4: Bold Script - Coin Stack with Arabic-inspired M
// Deep black with emerald accent
// Modern script meets geometric

interface LogoProps {
  size?: 'small' | 'medium' | 'large' | 'icon';
  variant?: 'full' | 'icon';
}

export function LogoVariation4({ size = 'medium', variant = 'full' }: LogoProps) {
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
      {/* Coin Stack Icon */}
      <svg
        width={currentSize}
        height={currentSize}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Back coin */}
        <ellipse cx="28" cy="28" rx="14" ry="14" fill="#10B981" opacity="0.3"/>
        
        {/* Middle coin */}
        <ellipse cx="24" cy="24" rx="14" ry="14" fill="#059669"/>
        
        {/* Front coin with M */}
        <ellipse cx="20" cy="20" rx="14" ry="14" fill="#000000"/>
        <ellipse cx="20" cy="20" rx="12" ry="12" fill="none" stroke="#10B981" strokeWidth="0.5"/>
        
        {/* Stylized M */}
        <path
          d="M13 24V14L17 19L20 14L23 19L27 14V24"
          stroke="#10B981"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      
      {variant === 'full' && (
        <div className="flex flex-col justify-center">
          <span 
            className="font-bold tracking-tight" 
            style={{ 
              color: '#000000', 
              fontSize: currentSize * 0.5,
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic'
            }}
          >
            Maal
          </span>
          <span 
            className="text-xs tracking-wide font-semibold" 
            style={{ color: '#10B981', fontSize: currentSize * 0.2 }}
          >
            مال • WEALTH
          </span>
        </div>
      )}
    </div>
  );
}
