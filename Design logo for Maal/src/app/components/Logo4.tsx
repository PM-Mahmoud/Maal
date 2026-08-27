// Logo 4: Bold Modern Tech - Black & Mint Accent
interface Logo4Props {
  size?: number;
  variant?: 'full' | 'icon';
}

export function Logo4({ size = 120, variant = 'full' }: Logo4Props) {
  if (variant === 'icon') {
    return (
      <svg width={size} height={size} viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Background */}
        <rect width="120" height="120" rx="30" fill="#0F172A" />
        
        {/* Abstract M formed by geometric shapes */}
        <path 
          d="M30 40H40L50 65L60 40H70L80 65L90 40V80H80V55L70 80H65L55 55V80H50V55L40 80H35L30 55V40Z" 
          fill="#6EE7B7" 
        />
        
        {/* Accent line */}
        <rect x="30" y="85" width="60" height="4" rx="2" fill="#6EE7B7" />
      </svg>
    );
  }

  return (
    <svg width={size * 2.6} height={size} viewBox="0 0 312 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Icon */}
      <rect width="120" height="120" rx="30" fill="#0F172A" />
      
      <path 
        d="M30 40H40L50 65L60 40H70L80 65L90 40V80H80V55L70 80H65L55 55V80H50V55L40 80H35L30 55V40Z" 
        fill="#6EE7B7" 
      />
      
      <rect x="30" y="85" width="60" height="4" rx="2" fill="#6EE7B7" />
      
      {/* Text */}
      <text x="150" y="75" fontFamily="Inter, -apple-system, sans-serif" fontSize="52" fontWeight="800" fill="#0F172A" letterSpacing="-2">
        Maal
      </text>
      
      {/* Accent dot on second 'a' */}
      <circle cx="232" cy="45" r="5" fill="#6EE7B7" />
    </svg>
  );
}
