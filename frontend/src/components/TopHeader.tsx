import { BrandLogo } from "./BrandLogo";

type TopHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onOpenSearch: () => void;
};

export const TopHeader = ({ query, onQueryChange, onOpenSearch }: TopHeaderProps) => (
  <header className="top-header">
    <div className="top-header-inner container">
      <BrandLogo className="brand-logo" />
      <div className="search-bar">
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={onOpenSearch}
          placeholder="Search movies, TV, series"
          aria-label="Search"
        />
      </div>
    </div>
  </header>
);
