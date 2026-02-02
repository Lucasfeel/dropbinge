import type { SVGProps } from "react";

export const IconMovie = (props: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...props}>
    <path
      d="M4.5 8.5h15A2 2 0 0 1 21.5 10.5v8A2 2 0 0 1 19.5 20.5h-15A2 2 0 0 1 2.5 18.5v-8A2 2 0 0 1 4.5 8.5Z"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <path
      d="M2.7 8.5l3.2-4h14.4l-3.2 4"
      strokeWidth={1.8}
      strokeLinejoin="round"
    />
    <path d="M7.2 4.5l-3.2 4" strokeWidth={1.8} strokeLinecap="round" />
    <path d="M12 4.5l-3.2 4" strokeWidth={1.8} strokeLinecap="round" />
    <path d="M16.8 4.5l-3.2 4" strokeWidth={1.8} strokeLinecap="round" />
  </svg>
);
