// Logo 1: Modern Minimal M with Coin - Navy & Gold
interface Logo1Props {
  size?: number;
  variant?: 'full' | 'icon';
}

export function Logo1({ size = 120, variant = 'full' }: Logo1Props) {
  const scale = size / 120;
  
  if (variant === 'icon') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Circular coin background */}
        <circle cx="60" cy="60" r="55" fill="#0A2540" />
        <circle cx="60" cy="60" r="55" fill="url(#gold-gradient)" opacity="0.1" />
        
        {/* Inner circle detail */}
        <circle cx="60" cy="60" r="50" stroke="#D4AF37" strokeWidth="1" opacity="0.3" />
        
        {/* Modern M letterform */}
        <path 
          d="M35 75V45L50 60L65 45L80 60V45V75" 
          stroke="#D4AF37" 
          strokeWidth="6" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          fill="none"
        />
        
        <defs>
          <linearGradient id="gold-gradient" x1="0" y1="0" x2="120" y2="120">
            <stop offset="0%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#F4E5C3" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  return (
    <svg width={size * 2.5} height={size} viewBox="0 0 300 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Icon part - coin with M */}
      <circle cx="60" cy="60" r="55" fill="#0A2540" />
      <circle cx="60" cy="60" r="55" fill="url(#gold-gradient-full)" opacity="0.1" />
      <circle cx="60" cy="60" r="50" stroke="#D4AF37" strokeWidth="1" opacity="0.3" />
      
      <path 
        d="M35 75V45L50 60L65 45L80 60V45V75" 
        stroke="#D4AF37" 
        strokeWidth="6" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
      
      {/* Text "Maal" */}
      <text x="140" y="72" fontFamily="SF Pro Display, -apple-system, sans-serif" fontSize="48" fontWeight="600" fill="#0A2540" letterSpacing="-1">
        Maal
      </text>
      
      <defs>
        <linearGradient id="gold-gradient-full" x1="0" y1="0" x2="120" y2="120">
          <stop offset="0%" stopColor="#D4AF37" />
          <stop offset="100%" stopColor="#F4E5C3" />
        </linearGradient>
      </defs>
    </svg>
  );
}
