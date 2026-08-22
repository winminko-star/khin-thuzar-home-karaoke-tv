import { memo } from "react";

function TvHeader({ status, onOpenQr }) {
  return (
    <header className="tv-header">
      <div className="tv-title">
        <div className="tv-marquee">
          <span className="marquee-text">
            ✨ 💚 Khin Thuzar Hlaing 💚 ✨
          </span>
        </div>

        <h1 className="karaoke-title">
          <span className="rainbow-title">
            HOME KARAOKE
          </span>

          <span className="dancing-mic" aria-hidden="true">
            🎤
          </span>
        </h1>
      </div>

      <div className="tv-header-actions">
        <button
          type="button"
          className="qr-button"
          onClick={onOpenQr}
          aria-label="Open Remote QR Code"
          title="Open Remote QR Code"
        >
          🇲🇲
        </button>

        <span className="tv-status">{status}</span>
      </div>
    </header>
  );
}

export default memo(TvHeader);
