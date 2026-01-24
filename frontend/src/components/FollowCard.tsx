import type { ReactNode } from "react";

import type { Follow } from "../types";
import { getTitle } from "../utils/title";

type FollowCardProps = {
  follow: Follow;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

export const FollowCard = ({ follow, subtitle, actions }: FollowCardProps) => (
  <div className="card">
    <strong>{getTitle(follow)}</strong>
    {subtitle && <div className="muted">{subtitle}</div>}
    {actions && <div className="button-row">{actions}</div>}
  </div>
);
