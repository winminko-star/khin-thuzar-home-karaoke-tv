import { useEffect, useRef, useState } from "react";
import { configured, supabase } from "./lib/supabase";

const ROOM_ID =
  import.meta.env.VITE_KARAOKE_ROOM_ID || "wmk-home-karaoke";

function extractYouTubeVideoId(value) {
  if (!value) return "";

  const text = String(value).trim();

  // Raw YouTube video ID
  if (/^[A-Za-z0-9_-]{11}$/.test(text)) {
    return text;
  }

  // Full or shortened YouTube URL
  try {
    const url = new URL(text);

    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    }

    if (url.hostname.includes("youtube.com")) {
      const queryId = url.searchParams.get("v");

      if (/^[A-Za-z0-9_-]{11}$/.test(queryId || "")) {
        return queryId;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.findIndex((part) =>
        ["embed", "shorts", "live"].includes(part)
      );

      const pathId =
        embedIndex >= 0 ? parts[embedIndex + 1] || "" : "";

      return /^[A-Za-z0-9_-]{11}$/.test(pathId) ? pathId : "";
    }
  } catch {
    return "";
  }

  return "";
}

function getNextQueueSong(queue, currentIndex) {
  if (!Array.isArray(queue) || queue.length < 2) {
    return null;
  }

  const safeIndex =
    Number.isInteger(currentIndex) && currentIndex >= 0
      ? currentIndex
      : -1;

  return queue[(safeIndex + 1) % queue.length] || null;
}

export default function App() {
  const playerHost = useRef(null);
  const player = useRef(null);
  const channel = useRef(null);

  const playerUnlockedRef = useRef(false);
  const pendingVideoRef = useRef(null);

  const [song, setSong] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerUnlocked, setPlayerUnlocked] = useState(false);
  const [status, setStatus] = useState(
    configured ? "Connecting…" : "Supabase not configured"
  );

  useEffect(() => {
    function createPlayer() {
      if (!window.YT?.Player || !playerHost.current || player.current) {
        return;
      }

      player.current = new window.YT.Player(playerHost.current, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            setPlayerReady(true);
            setStatus(configured ? "Remote ready" : "Supabase not configured");

            const pendingId = extractYouTubeVideoId(
              pendingVideoRef.current?.id ||
                pendingVideoRef.current?.videoId ||
                pendingVideoRef.current?.youtube_url ||
                pendingVideoRef.current?.url
            );

            if (pendingId) {
              player.current?.cueVideoById(pendingId);
            }
          },

          onStateChange: (event) => {
            if (event.data === window.YT.PlayerState.ENDED) {
              channel.current?.send({
                type: "broadcast",
                event: "tv-status",
                payload: {
                  type: "VIDEO_ENDED",
                },
              });
            }
          },

          onError: (event) => {
            console.error("YouTube Player Error:", event.data);

            const messages = {
              2: "Video ID မမှန်ပါ",
              5: "ဒီ video ကို HTML5 player နဲ့မဖွင့်နိုင်ပါ",
              100: "Video မရှိတော့ပါ သို့မဟုတ် Private ဖြစ်နေပါသည်",
              101: "ဒီ video ကို TV App ထဲ Embed လုပ်ခွင့်မပြုပါ",
              150: "ဒီ video ကို TV App ထဲ Embed လုပ်ခွင့်မပြုပါ",
              153: "YouTube player request identification ပြဿနာရှိပါသည်",
            };

            setStatus(messages[event.data] || `YouTube error: ${event.data}`);
          },
        },
      });
    }

    if (window.YT?.Player) {
      createPlayer();
      return undefined;
    }

    window.onYouTubeIframeAPIReady = createPlayer;

    let script = document.querySelector(
      'script[src="https://www.youtube.com/iframe_api"]'
    );

    if (!script) {
      script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(script);
    }

    return () => {
      window.onYouTubeIframeAPIReady = null;
    };
  }, []);

  useEffect(() => {
    if (!configured || !supabase) {
      return undefined;
    }

    const realtimeChannel = supabase.channel(`karaoke-room:${ROOM_ID}`, {
      config: {
        broadcast: {
          self: true,
        },
      },
    });

    realtimeChannel
      .on(
        "broadcast",
        {
          event: "karaoke-command",
        },
        ({ payload }) => {
          const { type, payload: data = {} } = payload || {};

          if (type === "LOAD_AND_PLAY") {
            const selectedVideo = data.video;

            if (!selectedVideo) {
              setStatus("Video data မရပါ");
              return;
            }

            const videoId = extractYouTubeVideoId(
              selectedVideo.id ||
                selectedVideo.videoId ||
                selectedVideo.youtube_url ||
                selectedVideo.url
            );

            if (!videoId) {
              console.error("Invalid video object:", selectedVideo);
              setStatus("Video ID မမှန်ပါ");
              return;
            }

            const normalizedVideo = {
              ...selectedVideo,
              id: videoId,
            };

            pendingVideoRef.current = normalizedVideo;
            setSong(normalizedVideo);
            setNextSong(getNextQueueSong(data.queue, data.index));

            if (!player.current) {
              setStatus("YouTube player loading…");
              return;
            }

            if (playerUnlockedRef.current) {
              player.current.loadVideoById(videoId);
            } else {
              player.current.cueVideoById(videoId);
              setStatus("TV မှာ Start Karaoke နှိပ်ပါ");
            }

            return;
          }

          if (type === "PLAY") {
            if (!playerUnlockedRef.current) {
              setStatus("TV မှာ Start Karaoke နှိပ်ပါ");
              return;
            }

            player.current?.playVideo();
            return;
          }

          if (type === "PAUSE") {
            player.current?.pauseVideo();
            return;
          }

          if (type === "STOP") {
            player.current?.stopVideo();
            return;
          }

          if (type === "CLEAR_QUEUE") {
            setNextSong(null);
            return;
          }

          if (type === "SYNC_QUEUE") {
            setNextSong(
              getNextQueueSong(data.queue, data.currentIndex)
            );
          }
        }
      )
      .subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus(
            playerUnlockedRef.current ? "Remote connected" : "Remote ready"
          );

          await realtimeChannel.send({
            type: "broadcast",
            event: "tv-status",
            payload: {
              type: "READY",
            },
          });

          return;
        }

        setStatus(subscriptionStatus);
      });

    channel.current = realtimeChannel;

    return () => {
      supabase.removeChannel(realtimeChannel);
      channel.current = null;
    };
  }, []);

  function startKaraoke() {
    if (!playerReady) {
      setStatus("YouTube Player ပြင်ဆင်နေသည်…");
      return;
    }

    playerUnlockedRef.current = true;
    setPlayerUnlocked(true);
    setStatus(configured ? "Remote connected" : "Ready");

    const videoId = extractYouTubeVideoId(
      song?.id || song?.videoId || song?.youtube_url || song?.url
    );

    if (videoId) {
      player.current?.loadVideoById(videoId);
    }
  }

  return (
    <main className="tv-shell">
      <header className="tv-header">
        <div className="tv-title">
          <div className="tv-marquee">
            <span>
              💚 Khin Thuzar Hlaing 💚  </span>
          </div>

          <h1>HOME KARAOKE 🎤</h1>
        </div>

        <span className="tv-status">{status}</span>
      </header>

      <section className="screen">
        <div ref={playerHost} className="player" />

        {(!song || !playerUnlocked) && (
          <div className="standby">
            <div>🎤</div>

            <h2>{!playerUnlocked ? "Start Karaoke" : "Ready to Sing"}</h2>

            <p>
              {!playerReady
                ? "YouTube Player ပြင်ဆင်နေသည်…"
                : !playerUnlocked
                  ? song
                    ? "သီချင်းအဆင်သင့်ဖြစ်ပါပြီ။ Start ကိုနှိပ်ပါ"
                    : "ပထမဆုံးတစ်ကြိမ် Start ကိုနှိပ်ပါ"
                  : "Remote App ကနေ သီချင်းရွေးပါ"}
            </p>

            {!playerUnlocked && (
              <button
                type="button"
                className="start-karaoke-button"
                onClick={startKaraoke}
                disabled={!playerReady}
              >
                ▶ Start Karaoke
              </button>
            )}
          </div>
        )}
      </section>

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
    </main>
  );
}
