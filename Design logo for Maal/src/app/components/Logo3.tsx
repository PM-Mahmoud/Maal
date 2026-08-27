// Logo 3: Script Wordmark with Elegant M Coin - Navy & Rose Gold
interface Logo3Props {
  size?: number;
  variant?: 'full' | 'icon';
}

export function Logo3({ size = 120, variant = 'full' }: Logo3Props) {
  if (variant === 'icon') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Gradient background circle */}
        <circle cx="60" cy="60" r="58" fill="url(#rose-gradient)" />
        
        {/* Elegant M with serif-like treatment */}
        <path 
          d="M30 75V45C30 45 35 40 40 45L50 55L60 45L70 55L80 45C85 40 90 45 90 45V75" 
          stroke="#1E293B" 
          strokeWidth="3.5" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          fill="none"
        />
        
        {/* Decorative underline arc */}
        <path 
          d="M35 80Q60 88 85 80" 
          stroke="#B76E79" 
          strokeWidth="2" 
          strokeLinecap="round"
          fill="none"
        />
        
        <defs>
          <linearGradient id="rose-gradient" x1="0" y1="0" x2="120" y2="120">
            <stop offset="0%" stopColor="#FFF1F2" />
            <stop offset="100%" stopColor="#FECDD3" />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  return (
    <svg width={size * 2.5} height={size} viewBox="0 0 300 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Icon */}
      <circle cx="60" cy="60" r="58" fill="url(#rose-gradient-full)" />
      
      <path 
        d="M30 75V45C30 45 35 40 40 45L50 55L60 45L70 55L80 45C85 40 90 45 90 45V75" 
        stroke="#1E293B" 
        strokeWidth="3.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
      
      <path 
        d="M35 80Q60 88 85 80" 
        stroke="#B76E79" 
        strokeWidth="2" 
        strokeLinecap="round"
        fill="none"
      />
      
      {/* Script-style text */}
      <text 
        x="140" 
        y="78" 
        fontFamily="Georgia, serif" 
        fontSize="52" 
        fontWeight="400" 
        fill="#1E293B" 
        fontStyle="italic"
        letterSpacing="-0.5"
      >
        Maal
      </text>
      
      <defs>
        <linearGradient id="rose-gradient-full" x1="0" y1="0" x2="120" y2="120">
          <stop offset="0%" stopColor="#FFF1F2" />
          <stop offset="100%" stopColor="#FECDD3" />
        </linearGradient>
      </defs>
    </svg>
  );
}
