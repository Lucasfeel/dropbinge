import { useState } from "react";
import { Outlet } from "react-router-dom";

import { BottomNav } from "./BottomNav";
import { SearchOverlay } from "./SearchOverlay";
import { TopHeader } from "./TopHeader";

export const AppShell = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  return (
    <div className="app-shell">
      <TopHeader
        query={query}
        onQueryChange={(value) => {
          setQuery(value);
          if (value.trim()) {
            setSearchOpen(true);
          }
        }}
        onOpenSearch={() => setSearchOpen(true)}
      />
      <main className="main-content">
        <Outlet />
      </main>
      <BottomNav />
      <SearchOverlay
        open={searchOpen}
        query={query}
        onQueryChange={setQuery}
        onClose={() => setSearchOpen(false)}
      />
    </div>
  );
};
