import { memo } from "react";

function NowPlayingFooter({ song, nextSong }) {
  return (
    <footer>
      <div>
        <small>NOW PLAYING</small>
        <strong>{song?.title || "Waiting for song…"}</strong>
        <span>{song?.channel || ""}</span>
      </div>

      <div className="next">
        <small>NEXT</small>
        <strong>{nextSong?.title || "Queue empty"}</strong>
      </div>
    </footer>
  );
}

export default memo(NowPlayingFooter);
