import { memo } from "react";

function ScenerySlideshow({ imageSrc }) {
  return (
    <div className="scenery-slideshow">
      <img
        key={imageSrc}
        src={imageSrc}
        alt=""
        className="scenery-slide-image"
      />
    </div>
  );
}

export default memo(ScenerySlideshow);
