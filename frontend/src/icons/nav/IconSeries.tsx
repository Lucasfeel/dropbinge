import type { SVGProps } from "react";

export const IconSeries = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <rect x="14.4" y="8.1" width="6.9" height="7.8" rx="1.6" strokeWidth={1.9} />
    <rect x="10.1" y="6.8" width="8.5" height="10.4" rx="1.9" strokeWidth={1.9} />
    <path
      d="M4.1 8.2c0-1.3 1.1-2.3 2.3-2.3h5.4c1.3 0 2.3 1 2.3 2.3v8.9c0 1.3-1 2.2-2.3 2.1L6.4 18.5A2.3 2.3 0 0 1 4.1 16.2V8.2Z"
      strokeWidth={1.9}
    />
  </svg>
);
