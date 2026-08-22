import { memo } from "react";

function AnnouncementBanner({ message }) {
  return (
    <div className="announcement-banner" role="status">
      <div className="announcement-banner-glow" />
      <div className="announcement-banner-text">{message}</div>
    </div>
  );
}

export default memo(AnnouncementBanner);
