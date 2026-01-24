import { Route, Routes } from "react-router-dom";
import { useState } from "react";

import { BottomNav } from "./components/BottomNav";
import { SearchOverlay } from "./components/SearchOverlay";
import { TopBar } from "./components/TopBar";
import { AuthProvider } from "./context/AuthContext";
import { FollowsProvider } from "./context/FollowsContext";
import { useAuth } from "./hooks/useAuth";
import { useFollows } from "./hooks/useFollows";
import { HomePage } from "./pages/HomePage";
import { MoviePage } from "./pages/MoviePage";
import { MyPage } from "./pages/MyPage";
import { SeriesPage } from "./pages/SeriesPage";
import { TvPage } from "./pages/TvPage";

const AppShell = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const { refresh } = useFollows();
  const { user } = useAuth();

  return (
    <div className="app">
      <TopBar onOpenSearch={() => setSearchOpen(true)} />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/movie" element={<MoviePage />} />
        <Route path="/tv" element={<TvPage />} />
        <Route path="/series" element={<SeriesPage />} />
        <Route path="/my" element={<MyPage />} />
      </Routes>
      <BottomNav />
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onFollowCreated={refresh}
      />
      {user && (
        <div className="muted" style={{ padding: 12 }}>
          Signed in as {user.email}
        </div>
      )}
    </div>
  );
};

const App = () => (
  <AuthProvider>
    <FollowsProvider>
      <AppShell />
    </FollowsProvider>
  </AuthProvider>
);

export default App;
