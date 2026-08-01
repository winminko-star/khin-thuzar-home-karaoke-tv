import { useEffect, useRef, useState } from "react";
import { configured, supabase } from "./lib/supabase";

const ROOM_ID =
  import.meta.env.VITE_KARAOKE_ROOM_ID || "wmk-home-karaoke";

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
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
        },
        events: {
          onReady: () => {
            setPlayerReady(true);
            setStatus(configured ? "Remote ready" : "Supabase not configured");

            if (pendingVideoRef.current?.id) {
              player.current?.cueVideoById(pendingVideoRef.current.id);
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
            setStatus(`YouTube error: ${event.data}`);
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

            if (!selectedVideo?.id) {
              return;
            }

            pendingVideoRef.current = selectedVideo;
            setSong(selectedVideo);
            setNextSong(data.queue?.[data.index + 1] || null);

            if (!player.current) {
              setStatus("YouTube player loading…");
              return;
            }

            if (playerUnlockedRef.current) {
              player.current.loadVideoById(selectedVideo.id);
            } else {
              player.current.cueVideoById(selectedVideo.id);
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
            setNextSong(data.queue?.[data.currentIndex + 1] || null);
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

    if (song?.id) {
      player.current?.loadVideoById(song.id);
    }
  }

  return (
    <main className="tv-shell">
      <header className="tv-header">
        <div className="tv-title">
          <div className="tv-marquee">
            <span>
              KHIN THUZAR HLAING&apos;S • KHIN THUZAR HLAING&apos;S • KHIN
              THUZAR HLAING&apos;S
            </span>
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
