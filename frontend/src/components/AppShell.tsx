import { Outlet, useLocation } from "react-router-dom";

import { BottomNav } from "./BottomNav";
import { TopHeader } from "./TopHeader";

export const AppShell = () => {
  const location = useLocation();
  const isNarrow = ["/movie", "/tv", "/series"].some((route) =>
    location.pathname.startsWith(route),
  );

  return (
    <div className={`app-shell${isNarrow ? " layout-narrow" : ""}`}>
      <TopHeader />
      <main className="main-content">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
};
