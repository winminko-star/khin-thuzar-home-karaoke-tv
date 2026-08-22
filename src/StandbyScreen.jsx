import { memo } from "react";

function StandbyScreen({ standbyBanner, playerReady }) {
  return (
    <div className="standby">
      <div>
        <img
          src={standbyBanner}
          alt="Khin Thuzar Home Karaoke TV"
          className="standby-banner"
        />
      </div>

      <p>
        {!playerReady
          ? "ကျေးဇူးပြု၍ Wifi ချိတ်ဆက်ပါ"
          : "Remote App ကနေ သီချင်းရွေးပါ"}
      </p>
    </div>
  );
}

export default memo(StandbyScreen);
