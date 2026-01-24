type TopBarProps = {
  onOpenSearch: () => void;
};

export const TopBar = ({ onOpenSearch }: TopBarProps) => (
  <header className="topbar">
    <h1>DropBinge</h1>
    <button className="search-button" onClick={onOpenSearch}>
      Search
    </button>
  </header>
);
