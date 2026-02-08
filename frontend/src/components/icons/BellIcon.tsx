type BellIconProps = {
  size?: number;
  className?: string;
};

export const BellIcon = ({ size = 14, className = "" }: BellIconProps) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    width={size}
    height={size}
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);
