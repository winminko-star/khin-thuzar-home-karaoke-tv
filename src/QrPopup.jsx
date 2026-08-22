import { memo } from "react";

function QrPopup({ onClose }) {
  return (
    <div className="qr-overlay" onClick={onClose}>
      <div
        className="qr-popup"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="qr-close-button"
          onClick={onClose}
          aria-label="Close QR Code"
        >
          ✕
        </button>

        <h2>Scan to Open Remote</h2>

        <img
          src="/remote-qr.png"
          alt="Karaoke Remote Website QR Code"
          className="qr-image"
        />

        <p>ဖုန်း Camera ဖြင့် Scan လုပ်ပါ</p>
      </div>
    </div>
  );
}

export default memo(QrPopup);
