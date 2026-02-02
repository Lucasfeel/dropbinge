type TopHeaderProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onOpenSearch: () => void;
};

export const TopHeader = ({ query, onQueryChange, onOpenSearch }: TopHeaderProps) => (
  <header className="top-header">
    <div className="logo">DropBinge</div>
    <div className="search-bar">
      <input
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onFocus={onOpenSearch}
        placeholder="Search movies, TV, series"
        aria-label="Search"
      />
    </div>
  </header>
);
