import { useCallback, useEffect, useRef, useState } from "react";
import { configured, supabase } from "./lib/supabase";

const ROOM_ID =
  import.meta.env.VITE_KARAOKE_ROOM_ID || "wmk-home-karaoke";

const YOUTUBE_IFRAME_API = "https://www.youtube.com/iframe_api";

function isValidVideoId(value) {
  return /^[A-Za-z0-9_-]{11}$/.test(value || "");
}

function extractYouTubeVideoId(value) {
  if (!value) return "";

  const text = String(value).trim();

  if (isValidVideoId(text)) {
    return text;
  }

  try {
    const url = new URL(text);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return isValidVideoId(id) ? id : "";
    }

    if (host === "youtube.com" || host.endsWith(".youtube.com")) {
      const queryId = url.searchParams.get("v") || "";

      if (isValidVideoId(queryId)) {
        return queryId;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const markerIndex = parts.findIndex((part) =>
        ["embed", "shorts", "live"].includes(part)
      );
      const pathId = markerIndex >= 0 ? parts[markerIndex + 1] || "" : "";

      return isValidVideoId(pathId) ? pathId : "";
    }
  } catch {
    return "";
  }

  return "";
}

function normalizeVideo(video) {
  if (!video || typeof video !== "object") return null;

  const id = extractYouTubeVideoId(
    video.id || video.videoId || video.youtube_url || video.url
  );

  return id ? { ...video, id } : null;
}

function getNextQueueSong(queue, currentIndex) {
  if (!Array.isArray(queue) || queue.length === 0) return null;

  const index = Number.isInteger(currentIndex) ? currentIndex : -1;

  if (index < 0) {
    return queue[0] || null;
  }

  return queue[index + 1] || null;
}


function queueRowToSong(row) {
  return {
    id: row.video_id,
    queueId: `db-${row.id}`,
    dbId: row.id,
    title: row.title || "",
    channel: row.channel || "",
    thumbnail: row.thumbnail || "",
  };
}

function loadYouTubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (window.__karaokeYouTubeApiPromise) {
    return window.__karaokeYouTubeApiPromise;
  }

  window.__karaokeYouTubeApiPromise = new Promise((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      resolve(window.YT);
    };

    let script = document.querySelector(`script[src="${YOUTUBE_IFRAME_API}"]`);

    if (!script) {
      script = document.createElement("script");
      script.src = YOUTUBE_IFRAME_API;
      script.async = true;
      script.onerror = () => reject(new Error("YouTube Player API load မရပါ။"));
      document.head.appendChild(script);
    }
  });

  return window.__karaokeYouTubeApiPromise;
}

function getYouTubeErrorMessage(code) {
  const messages = {
    2: "Video ID မမှန်ပါ။ တခြားသီချင်းတစ်ပုဒ်ကို စမ်းပါ။",
    5: "ဒီ video ကို HTML5 player နဲ့ မဖွင့်နိုင်ပါ။",
    100: "Video မရှိတော့ပါ သို့မဟုတ် Private ဖြစ်နေပါသည်။",
    101: "ဒီ video ကို TV App ထဲ Embed လုပ်ခွင့်မပြုပါ။",
    150: "ဒီ video ကို TV App ထဲ Embed လုပ်ခွင့်မပြုပါ။",
    153: "YouTube player request identification ပြဿနာရှိပါသည်။",
  };

  return messages[code] || `YouTube error: ${code}`;
}
function clampVolume(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

export default function App() {
  const playerHost = useRef(null);
  const player = useRef(null);
  const channel = useRef(null);
  const queueChannel = useRef(null);
  const queueReloadTimer = useRef(null);
  const playerUnlockedRef = useRef(false);
  const playerReadyRef = useRef(false);
  const pendingVideoRef = useRef(null);

  const [song, setSong] = useState(null);
  const [nextSong, setNextSong] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerUnlocked, setPlayerUnlocked] = useState(false);
  const [status, setStatus] = useState(
    configured ? "Connecting…" : "Supabase not configured"
  );

  const loadQueueFromDatabase = useCallback(async () => {
    if (!configured || !supabase) return;

    const { data, error } = await supabase
      .from("karaoke_queue")
      .select("*")
      .eq("room_id", ROOM_ID)
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      setStatus(`Queue sync error: ${error.message}`);
      return;
    }

    const rows = data || [];
    const queue = rows.map(queueRowToSong);
    const playingIndex = rows.findIndex((row) => row.is_playing === true);
    const activeSong = playingIndex >= 0 ? queue[playingIndex] : null;

    setNextSong(getNextQueueSong(queue, playingIndex));

    if (!activeSong) {
      pendingVideoRef.current = null;
      setSong(null);
      return;
    }

    const selectedVideo = normalizeVideo(activeSong);

    if (!selectedVideo) {
      setStatus("Database video ID မမှန်ပါ။");
      return;
    }

    const changedVideo = pendingVideoRef.current?.id !== selectedVideo.id;

    pendingVideoRef.current = selectedVideo;
    setSong(selectedVideo);

    if (!changedVideo || !playerReadyRef.current || !player.current) {
      return;
    }

    if (playerUnlockedRef.current) {
      player.current.loadVideoById(selectedVideo.id);
      setStatus("Remote connected");
    } else {
      player.current.cueVideoById(selectedVideo.id);
      setStatus("TV မှာ Start Karaoke နှိပ်ပါ");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !playerHost.current || player.current) return;

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
              if (cancelled) return;

              playerReadyRef.current = true;
              setPlayerReady(true);
              setStatus(configured ? "Remote ready" : "Supabase not configured");

              const pendingVideo = normalizeVideo(pendingVideoRef.current);

              if (pendingVideo) {
                player.current?.cueVideoById(pendingVideo.id);
              }
            },
            onStateChange: (event) => {
              if (event.data !== window.YT.PlayerState.ENDED) return;

              channel.current?.send({
                type: "broadcast",
                event: "tv-status",
                payload: { type: "VIDEO_ENDED" },
              });
            },
            onError: (event) => {
              console.error("YouTube Player Error:", event.data);
              setStatus(getYouTubeErrorMessage(event.data));
            },
          },
        });
      })
      .catch((error) => {
        console.error(error);
        setStatus(error.message || "YouTube Player API load မရပါ။");
      });

    return () => {
      cancelled = true;
      playerReadyRef.current = false;
      player.current?.destroy?.();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    if (!configured || !supabase) return undefined;

    loadQueueFromDatabase();

    const realtimeQueueChannel = supabase
      .channel(`tv-queue:${ROOM_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "karaoke_queue",
          filter: `room_id=eq.${ROOM_ID}`,
        },
        () => {
          window.clearTimeout(queueReloadTimer.current);

          queueReloadTimer.current = window.setTimeout(() => {
            loadQueueFromDatabase();
          }, 180);
        }
      )
      .subscribe();

    queueChannel.current = realtimeQueueChannel;

    return () => {
      window.clearTimeout(queueReloadTimer.current);
      supabase.removeChannel(realtimeQueueChannel);
      queueChannel.current = null;
    };
  }, [loadQueueFromDatabase]);

  useEffect(() => {
    if (!configured || !supabase) return undefined;

    const realtimeChannel = supabase.channel(`karaoke-room:${ROOM_ID}`, {
      config: { broadcast: { self: true } },
    });

    realtimeChannel
      .on(
        "broadcast",
        { event: "karaoke-command" },
        ({ payload }) => {
          const { type, payload: data = {} } = payload || {};

          if (type === "LOAD_AND_PLAY") {
            const selectedVideo = normalizeVideo(data.video);

            if (!selectedVideo) {
              console.error("Invalid video object:", data.video);
              setStatus("Video ID မမှန်ပါ။");
              return;
            }

            pendingVideoRef.current = selectedVideo;
            setSong(selectedVideo);
            setNextSong(getNextQueueSong(data.queue, data.index));

            if (!playerReadyRef.current || !player.current) {
              setStatus("YouTube player loading…");
              return;
            }

            if (playerUnlockedRef.current) {
              player.current.loadVideoById(selectedVideo.id);
              setStatus("Remote connected");
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
          if (type === "VOLUME_UP") {
  const currentVolume =
    player.current?.getVolume?.() ?? 50;

  const nextVolume = clampVolume(
    currentVolume + 10
  );

  player.current?.unMute?.();
  player.current?.setVolume?.(nextVolume);

  setStatus(`Volume ${nextVolume}%`);
  return;
}

if (type === "VOLUME_DOWN") {
  const currentVolume =
    player.current?.getVolume?.() ?? 50;

  const nextVolume = clampVolume(
    currentVolume - 10
  );

  player.current?.setVolume?.(nextVolume);

  if (nextVolume === 0) {
    player.current?.mute?.();
    setStatus("Muted");
  } else {
    setStatus(`Volume ${nextVolume}%`);
  }

  return;
}

if (type === "TOGGLE_MUTE") {
  if (player.current?.isMuted?.()) {
    player.current?.unMute?.();

    setStatus(
      `Volume ${
        player.current?.getVolume?.() ?? 50
      }%`
    );
  } else {
    player.current?.mute?.();
    setStatus("Muted");
  }

  return;
}

          if (type === "CLEAR_QUEUE") {
            pendingVideoRef.current = null;
            setSong(null);
            setNextSong(null);
            player.current?.stopVideo();
            return;
          }

          if (type === "SYNC_QUEUE") {
            setNextSong(getNextQueueSong(data.queue, data.currentIndex));
          }
        }
      )
      .subscribe(async (subscriptionStatus) => {
        if (subscriptionStatus === "SUBSCRIBED") {
          setStatus(playerUnlockedRef.current ? "Remote connected" : "Remote ready");

          await realtimeChannel.send({
            type: "broadcast",
            event: "tv-status",
            payload: { type: "READY" },
          });

          return;
        }

        if (subscriptionStatus === "CHANNEL_ERROR") {
          setStatus("Remote connection error");
          return;
        }

        if (subscriptionStatus === "TIMED_OUT") {
          setStatus("Remote connection timed out");
          return;
        }

        if (subscriptionStatus === "CLOSED") {
          setStatus("Remote disconnected");
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
    if (!playerReadyRef.current || !player.current) {
      setStatus("YouTube Player ပြင်ဆင်နေသည်…");
      return;
    }

    playerUnlockedRef.current = true;
    setPlayerUnlocked(true);
    setStatus(configured ? "Remote connected" : "Ready");

    const selectedVideo = normalizeVideo(song || pendingVideoRef.current);

    if (selectedVideo) {
      player.current.loadVideoById(selectedVideo.id);
    }
  }

  return (
    <main className="tv-shell">
      <header className="tv-header">
        <div className="tv-title">
          <div className="tv-marquee">
            <span>💚 Khin Thuzar Hlaing 💚</span>
          </div>

          <h1>HOME KARAOKE 🎤</h1>
        </div>

        <span className="tv-status">{status}</span>
      </header>

      <section className="screen">
        <div ref={playerHost} className="player" />

        {(!song || !playerUnlocked) && (
          <div className="standby">
            <div><img
  src="/logo.png"
  alt="Khin Thuzar Hlaing"
  className="standby-logo"
/></div>

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
