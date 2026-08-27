// Logo 2: Geometric Dollar Bill Stack - Emerald & Cream
interface Logo2Props {
  size?: number;
  variant?: 'full' | 'icon';
}

export function Logo2({ size = 120, variant = 'full' }: Logo2Props) {
  if (variant === 'icon') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Background */}
        <rect width="120" height="120" rx="24" fill="#065F46" />
        
        {/* Layered dollar bills creating depth */}
        <rect x="25" y="50" width="70" height="45" rx="4" fill="#10B981" opacity="0.3" />
        <rect x="20" y="40" width="70" height="45" rx="4" fill="#10B981" opacity="0.5" />
        <rect x="15" y="30" width="70" height="45" rx="4" fill="#ECFDF5" stroke="#10B981" strokeWidth="2" />
        
        {/* M symbol in the center */}
        <path 
          d="M30 52L40 42L50 52L60 42L70 52" 
          stroke="#065F46" 
          strokeWidth="4" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          fill="none"
        />
        
        {/* Small decorative circles (coin motif) */}
        <circle cx="30" cy="65" r="3" fill="#065F46" />
        <circle cx="60" cy="65" r="3" fill="#065F46" />
      </svg>
    );
  }

  return (
    <svg width={size * 2.8} height={size} viewBox="0 0 336 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Icon */}
      <rect width="120" height="120" rx="24" fill="#065F46" />
      <rect x="25" y="50" width="70" height="45" rx="4" fill="#10B981" opacity="0.3" />
      <rect x="20" y="40" width="70" height="45" rx="4" fill="#10B981" opacity="0.5" />
      <rect x="15" y="30" width="70" height="45" rx="4" fill="#ECFDF5" stroke="#10B981" strokeWidth="2" />
      
      <path 
        d="M30 52L40 42L50 52L60 42L70 52" 
        stroke="#065F46" 
        strokeWidth="4" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        fill="none"
      />
      
      <circle cx="30" cy="65" r="3" fill="#065F46" />
      <circle cx="60" cy="65" r="3" fill="#065F46" />
      
      {/* Text */}
      <text x="150" y="72" fontFamily="DM Sans, sans-serif" fontSize="48" fontWeight="700" fill="#065F46" letterSpacing="0">
        Maal
      </text>
    </svg>
  );
}
