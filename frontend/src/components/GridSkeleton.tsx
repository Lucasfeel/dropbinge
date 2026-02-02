type GridSkeletonProps = {
  count?: number;
};

export const GridSkeleton = ({ count = 8 }: GridSkeletonProps) => (
  <div className="poster-grid">
    {Array.from({ length: count }).map((_, index) => (
      <div key={index} className="poster-tile poster-skeleton">
        <div className="poster-tile-media">
          <div className="skeleton-box" />
        </div>
        <div className="poster-tile-footer">
          <div className="poster-tile-text">
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
          </div>
          <div className="skeleton-circle" />
        </div>
      </div>
    ))}
  </div>
);
