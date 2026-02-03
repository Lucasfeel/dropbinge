import { Route, Routes } from "react-router-dom";

import { AppShell } from "./components/AppShell";
import { ScrollRestoration } from "./components/ScrollRestoration";
import { AuthProvider } from "./context/AuthContext";
import { DetailsPage } from "./pages/DetailsPage";
import { HomePage } from "./pages/HomePage";
import { MoviePage } from "./pages/MoviePage";
import { MyPage } from "./pages/MyPage";
import { SearchPage } from "./pages/SearchPage";
import { SeasonDetailsPage } from "./pages/SeasonDetailsPage";
import { SeriesPage } from "./pages/SeriesPage";
import { TvPage } from "./pages/TvPage";

const App = () => (
  <AuthProvider>
    <ScrollRestoration />
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/movie" element={<MoviePage />} />
        <Route path="/tv" element={<TvPage />} />
        <Route path="/series" element={<SeriesPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/me" element={<MyPage />} />
        <Route path="/title/:mediaType/:tmdbId" element={<DetailsPage />} />
        <Route path="/title/tv/:tmdbId/season/:seasonNumber" element={<SeasonDetailsPage />} />
      </Route>
    </Routes>
  </AuthProvider>
);

export default App;
