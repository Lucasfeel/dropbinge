import type { ReactNode } from "react";

type HorizontalRailProps = {
  children: ReactNode;
};

export const HorizontalRail = ({ children }: HorizontalRailProps) => (
  <div className="horizontal-rail">
    <div className="horizontal-rail-track">{children}</div>
  </div>
);
