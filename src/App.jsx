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
function getSourceType(video) {
  if (video?.sourceType === "usb") {
    return "usb";
  }

  const id =
    video?.id ||
    video?.videoId ||
    "";

  return String(id).startsWith("usb:")
    ? "usb"
    : "youtube";
}

function getUsbFileId(video) {
  const id = String(video?.id || "");

  return id.startsWith("usb:")
    ? id.slice(4)
    : id;
}
function normalizeVideo(video) {
  if (!video || typeof video !== "object") {
    return null;
  }

  const sourceType = getSourceType(video);

  if (sourceType === "usb") {
    const rawId = String(
      video.id ||
        video.fileId ||
        video.uri ||
        video.path ||
        ""
    );

    if (!rawId) {
      return null;
    }

    return {
      ...video,
      id: rawId.startsWith("usb:")
        ? rawId
        : `usb:${rawId}`,
      sourceType: "usb"
    };
  }

  const id = extractYouTubeVideoId(
    video.id ||
      video.videoId ||
      video.youtube_url ||
      video.url
  );

  return id
    ? {
        ...video,
        id,
        sourceType: "youtube"
      }
    : null;
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
  const sourceType = String(
    row.video_id || ""
  ).startsWith("usb:")
    ? "usb"
    : "youtube";

  return {
    id: row.video_id,
    sourceType,
    queueId: `db-${row.id}`,
    dbId: row.id,
    title: row.title || "",
    channel: row.channel || "",
    thumbnail: row.thumbnail || ""
  };
}

function stateRowToSong(row) {
  if (!row?.current_video_id) {
    return null;
  }

  const sourceType = String(
    row.current_video_id
  ).startsWith("usb:")
    ? "usb"
    : "youtube";

  return {
    id: row.current_video_id,
    sourceType,
    title: row.current_title || "",
    channel: row.current_channel || "",
    thumbnail: row.current_thumbnail || ""
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
      script.onerror = () => reject(new Error(" Player API load မရပါ။"));
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
function getAndroidUsbBridge() {
  return window.AndroidUsb || null;
}

function parseUsbSongs(value) {
  try {
    const parsed =
      typeof value === "string"
        ? JSON.parse(value)
        : value;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((song) => {
      const rawId =
        song.id ||
        song.fileId ||
        song.uri ||
        song.path ||
        song.title;

      const id = String(rawId).startsWith(
        "usb:"
      )
        ? String(rawId)
        : `usb:${rawId}`;

      const title =
        song.title ||
        song.name ||
        song.fileName ||
        "USB Video";

      const searchText = [
        title,
                song.name,
        song.fileName,
        song.folder,
        song.path,
        song.searchText
      ]
        .filter(Boolean)
        .join(" ");

      return {
        ...song,
        id,
        sourceType: "usb",
        title,
        channel:
          song.channel ||
          song.folder ||
          "USB Storage",
        thumbnail: song.thumbnail || "",
        searchText
      };
    });
  } catch (error) {
    console.error(
      "USB song list parse error:",
      error
    );

    return [];
  }
}

const USB_CHUNK_SIZE = 50;
const USB_SEND_BATCH_SIZE = 1;

async function sendUsbSongsInChunks(targetChannel, songs) {
  if (!targetChannel?.send) {
    throw new Error("TV realtime channel မချိတ်ရသေးပါ။");
  }

  const safeSongs = Array.isArray(songs) ? songs : [];
  const transferId =
    `usb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const totalChunks = Math.max(
    1,
    Math.ceil(safeSongs.length / USB_CHUNK_SIZE)
  );

  const packets = Array.from(
    { length: totalChunks },
    (_, chunkIndex) => {
      const start = chunkIndex * USB_CHUNK_SIZE;
      const end = start + USB_CHUNK_SIZE;

      return {
        chunkIndex,
        payload: {
          type: "USB_SONGS_CHUNK",
          transferId,
          chunkIndex,
          totalChunks,
          songs: safeSongs.slice(start, end)
        }
      };
    }
  );

  for (
    let index = 0;
    index < packets.length;
    index += USB_SEND_BATCH_SIZE
  ) {
    const batch = packets.slice(
      index,
      index + USB_SEND_BATCH_SIZE
    );

    await Promise.all(
      batch.map(({ payload }) =>
        targetChannel.send({
          type: "broadcast",
          event: "tv-status",
          payload
        })
      )
    );
  }

  return {
    transferId,
    totalChunks,
    totalSongs: safeSongs.length
  };
}
const bannerImages = [
  "/tv_banner1.png",
  "/tv_banner2.png",
  "/tv_banner3.png",
  "/tv_banner4.png",
  "/tv_banner5.png",
];



export default function App() {
  const playerHost = useRef(null);
  const player = useRef(null);
  const channel = useRef(null);
  const queueChannel = useRef(null);
  const stateChannel = useRef(null);
  const queueReloadTimer = useRef(null);
  const stateReloadTimer = useRef(null);
  const playerUnlockedRef = useRef(true);
  const playerReadyRef = useRef(false);
  const pendingVideoRef = useRef(null);
   const [song, setSong] = useState(null);
  const [showQrPopup, setShowQrPopup] = useState(false);
  const [nextSong, setNextSong] = useState(null);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerUnlocked, setPlayerUnlocked] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [transitionCover, setTransitionCover] = useState(false);
const [transitionMinDone, setTransitionMinDone] = useState(false);
const [transitionMediaReady, setTransitionMediaReady] = useState(false);
const transitionTimerRef = useRef(null);
  const [showTextBanner, setShowTextBanner] =
  useState(false);

const [textBannerMessage, setTextBannerMessage] =
  useState("");
  const [sceneryShow, setSceneryShow] = useState(false);
const [sceneryIndex, setSceneryIndex] = useState(0);
  const [standbyBanner] = useState(() => {
  const randomIndex = Math.floor(Math.random() * bannerImages.length);
  return bannerImages[randomIndex];
});

const sceneryImages = [
  "/Main.png",
  "/One.png",
  "/Two.png",
  "/Three.png",
  "/Four.png",
  "/Five.png",
  "/Six.png",
  "/Seven.png",
  "/Eight.png",
  "/Nine.png",
  "/Ten.png",
];
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

    const queue = (data || []).map(queueRowToSong);
    setNextSong(queue[0] || null);
  }, []);
  const startSongTransition = useCallback((duration = 3000) => {
  window.clearTimeout(transitionTimerRef.current);

  setTransitionCover(true);
  setTransitionMinDone(false);
  setTransitionMediaReady(false);

  transitionTimerRef.current = window.setTimeout(() => {
    setTransitionMinDone(true);
  }, duration);
}, []);

  const loadPlaybackState = useCallback(async () => {
    if (!configured || !supabase) return;

    const { data, error } = await supabase
      .from("karaoke_state")
      .select("*")
      .eq("room_id", ROOM_ID)
      .maybeSingle();

    if (error) {
      setStatus(`Now Playing sync error: ${error.message}`);
      return;
    }

    const activeSong = stateRowToSong(data);

    if (!activeSong) {
  pendingVideoRef.current = null;
  setSong(null);

  player.current?.stopVideo?.();

  getAndroidUsbBridge()
    ?.stopUsbVideo?.();

  return;
    }

    const selectedVideo = normalizeVideo(activeSong);

if (!selectedVideo) {
  setStatus("Database video ID မမှန်ပါ။");
  return;
}

const changedVideo =
  pendingVideoRef.current?.id !==
  selectedVideo.id;

pendingVideoRef.current = selectedVideo;
setSong(selectedVideo);

if (!changedVideo) {
  return;
}

if (selectedVideo.sourceType === "usb") {
  const bridge = getAndroidUsbBridge();

  if (!bridge?.playUsbVideo) {
    setStatus(
      "Android USB Player မချိတ်ရသေးပါ။"
    );
    return;
  }

  player.current?.stopVideo?.();
  startSongTransition(800);

  bridge.playUsbVideo(
    getUsbFileId(selectedVideo)
  );
  setTransitionMediaReady(true);

  setStatus("USB သီချင်းဖွင့်နေသည်");
  return;
}

if (
  !playerReadyRef.current ||
  !player.current
) {
  return;
}
    startSongTransition(5000);

player.current.loadVideoById(
  selectedVideo.id
);

setStatus("Remote connected");
  }, []);
  
useEffect(() => {
  if (
    transitionCover &&
    transitionMinDone &&
    transitionMediaReady
  ) {
    setTransitionCover(false);
  }
}, [
  transitionCover,
  transitionMinDone,
  transitionMediaReady
]);
  const normalizeQueuePositions = useCallback(async () => {
    const { data } = await supabase
      .from("karaoke_queue")
      .select("id")
      .eq("room_id", ROOM_ID)
      .order("position", { ascending: true })
      .order("id", { ascending: true });

    if (!data) return;

    await Promise.all(
      data.map((row, index) =>
        supabase.from("karaoke_queue").update({ position: index }).eq("id", row.id)
      )
    );
      }, []);

  const advancePlaybackFromDatabase = useCallback(async () => {
    if (!configured || !supabase) return;

    const { data: rows, error } = await supabase
      .from("karaoke_queue")
      .select("*")
      .eq("room_id", ROOM_ID)
      .order("position", { ascending: true })
      .order("id", { ascending: true })
      .limit(1);

    if (error) {
      setStatus(`Auto Next error: ${error.message}`);
      return;
    }

    const nextRow = rows?.[0];

    if (!nextRow) {
  pendingVideoRef.current = null;

  setSong(null);
  setNextSong(null);

  player.current?.stopVideo?.();

  getAndroidUsbBridge()
    ?.stopUsbVideo?.();

  await supabase.from("karaoke_state").upsert(
    {
      room_id: ROOM_ID,
      current_video_id: null,
      current_title: null,
      current_channel: null,
      current_thumbnail: null,
      is_playing: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "room_id" }
  );

  setStatus("Remote connected");

  return;
    }

    await supabase.from("karaoke_queue").delete().eq("id", nextRow.id);
    await normalizeQueuePositions();

    await supabase.from("karaoke_state").upsert(
      {
        room_id: ROOM_ID,
        current_video_id: nextRow.video_id,
        current_title: nextRow.title,
        current_channel: nextRow.channel,
        current_thumbnail: nextRow.thumbnail,
        is_playing: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" }
    );
  }, [normalizeQueuePositions]);
  useEffect(() => {
  let retryTimer1 = null;
  let retryTimer2 = null;

  const syncAfterReconnect = async () => {
    try {
      await loadPlaybackState();
      await loadQueueFromDatabase();
    } catch (error) {
      console.error(
        "Reconnect sync error:",
        error
      );
    }
  };

  const handleInternetBack = () => {
    retryTimer1 = window.setTimeout(() => {
      // YouTube Player လုံးဝ မတက်သေးရင်
      // Page ကိုတစ်ခါ Reload လုပ်ပြီး
      // YouTube API ကိုအစကနေ ပြန်တင်
      if (!playerReadyRef.current) {
        window.location.reload();
        return;
      }

      // Player တက်ပြီးသားဆို
      // Page မ Reload ဘဲ
      // Remote / TV state ပဲ ပြန်ညှိ
      syncAfterReconnect();
    }, 1500);

    retryTimer2 = window.setTimeout(() => {
      // Player Ready ဖြစ်ပြီးသားဆို
      // 5 sec မှာ နောက်တစ်ကြိမ် Sync စစ်
      if (playerReadyRef.current) {
        syncAfterReconnect();
      }
    }, 5000);
  };

  window.addEventListener(
    "online",
    handleInternetBack
  );

  return () => {
    window.removeEventListener(
      "online",
      handleInternetBack
    );

    if (retryTimer1) {
      window.clearTimeout(retryTimer1);
    }

    if (retryTimer2) {
      window.clearTimeout(retryTimer2);
    }
  };
}, [
  loadPlaybackState,
  loadQueueFromDatabase
]);
  useEffect(() => {
  const handleAndroidReady = () => {
    setStatus("Android USB ready");
  };

  const handleUsbSongsUpdated = async () => {
    const bridge = getAndroidUsbBridge();

    if (!bridge?.getUsbSongs) return;

    try {
      const songs = parseUsbSongs(
        bridge.getUsbSongs()
      );

      if (!channel.current) {
        return;
      }

      await sendUsbSongsInChunks(
        channel.current,
        songs
      );

      setStatus(
        `USB စာရင်း ${songs.length} ပုဒ် Remote သို့ ပို့ပြီးပါပြီ`
      );
    } catch (error) {
      console.error(
        "USB songs update error:",
        error
      );

      channel.current?.send({
        type: "broadcast",
        event: "tv-status",
        payload: {
          type: "USB_ERROR",
          message:
            error?.message ||
            "USB သီချင်းစာရင်း ပို့မရပါ။"
        }
      });
    }
  };

  const handleUsbVideoEnded = () => {
  startSongTransition(800);

  advancePlaybackFromDatabase().finally(() => {
    channel.current?.send({
      type: "broadcast",
      event: "tv-status",
      payload: {
        type: "VIDEO_ENDED"
      }
    });
  });
};

  window.addEventListener(
    "ANDROID_USB_READY",
    handleAndroidReady
  );

  window.addEventListener(
    "USB_SONGS_UPDATED",
    handleUsbSongsUpdated
  );

  window.addEventListener(
    "USB_VIDEO_ENDED",
    handleUsbVideoEnded
  );

  return () => {
    window.removeEventListener(
      "ANDROID_USB_READY",
      handleAndroidReady
    );

    window.removeEventListener(
      "USB_SONGS_UPDATED",
      handleUsbSongsUpdated
    );

    window.removeEventListener(
      "USB_VIDEO_ENDED",
      handleUsbVideoEnded
    );
  };
}, [advancePlaybackFromDatabase, startSongTransition]);
  useEffect(() => {
  if (!sceneryShow) {
    return undefined;
  }

  const timer = window.setInterval(() => {
    setSceneryIndex((current) => {
      return (current + 1) % sceneryImages.length;
    });
  }, 120000);

  return () => {
    window.clearInterval(timer);
  };
}, [sceneryShow]);

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
            cc_load_policy: 0,
cc_lang_pref: "",
iv_load_policy: 3,
                        playsinline: 1,
            enablejsapi: 1,
            suggestedQuality: "large", // 480p စမ်းရန်
            origin: window.location.origin,
          },
          events: {
  onReady: (event) => {
    if (cancelled) return;

    playerReadyRef.current = true;
    setPlayerReady(true);
    setStatus(
      configured
        ? "Remote ready"
        : "Supabase not configured"
    );

    // Caption module ကို ပိတ်ရန် ကြိုးစားမယ်
    try {
      event.target.unloadModule?.("captions");
      event.target.unloadModule?.("cc");
    } catch (error) {
      console.warn("Caption ပိတ်မရပါ:", error);
    }

    const pendingVideo =
  normalizeVideo(
    pendingVideoRef.current
  );
    if (
  pendingVideo &&
  pendingVideo.sourceType === "youtube"
) {
  playerUnlockedRef.current = true;
  setPlayerUnlocked(true);
   startSongTransition(5000);

  event.target.loadVideoById(
    pendingVideo.id
  );
    }
  },
            onStateChange: (event) => {
  if (event.data === window.YT.PlayerState.PLAYING) {
    setTransitionMediaReady(true);
  }

  if (event.data === window.YT.PlayerState.ENDED) {
    startSongTransition(3000);

    advancePlaybackFromDatabase().finally(() => {
      channel.current?.send({
        type: "broadcast",
        event: "tv-status",
        payload: { type: "VIDEO_ENDED" },
      });
    });
  }
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
        setStatus(error.message || " Player API load မရပါ။");
      });

    return () => {
  cancelled = true;
  playerReadyRef.current = false;

  getAndroidUsbBridge()
    ?.stopUsbVideo?.();

  player.current?.destroy?.();
  player.current = null;
};
  }, [advancePlaybackFromDatabase, startSongTransition]);

  useEffect(() => {
    if (!configured || !supabase) return undefined;

    loadQueueFromDatabase();

    const reloadTvQueue = () => {
  window.clearTimeout(queueReloadTimer.current);

  queueReloadTimer.current = window.setTimeout(() => {
    loadQueueFromDatabase();
  }, 180);
};

const realtimeQueueChannel = supabase
  .channel(`tv-queue:${ROOM_ID}`)

  .on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "karaoke_queue",
      filter: `room_id=eq.${ROOM_ID}`,
    },
    reloadTvQueue
  )

  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "karaoke_queue",
      filter: `room_id=eq.${ROOM_ID}`,
    },
    reloadTvQueue
  )

  .on(
    "postgres_changes",
    {
      event: "DELETE",
      schema: "public",
      table: "karaoke_queue",
    },
    reloadTvQueue
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

    loadPlaybackState();

    const realtimeStateChannel = supabase
      .channel(`tv-state:${ROOM_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "karaoke_state",
          filter: `room_id=eq.${ROOM_ID}`,
        },
        () => {
          window.clearTimeout(stateReloadTimer.current);
          stateReloadTimer.current = window.setTimeout(() => {
            loadPlaybackState();
          }, 120);
        }
      )
      .subscribe();

    stateChannel.current = realtimeStateChannel;

    return () => {
      window.clearTimeout(stateReloadTimer.current);
      supabase.removeChannel(realtimeStateChannel);
      stateChannel.current = null;
    };
  }, [loadPlaybackState]);

  useEffect(() => {
    if (!configured || !supabase) return undefined;

    const realtimeChannel = supabase.channel(`karaoke-room:${ROOM_ID}`, {
      config: { broadcast: { self: true } },
    });

    realtimeChannel
      .on(
        "broadcast",
        { event: "karaoke-command" },
        async ({ payload }) => {
          const { type, payload: data = {} } = payload || {};

          if (type === "LOAD_AND_PLAY") {
  const selectedVideo =
    normalizeVideo(data.video);

  if (!selectedVideo) {
    console.error(
      "Invalid video object:",
      data.video
    );

    setStatus("Video ID မမှန်ပါ။");
    return;
  }

  pendingVideoRef.current =
    selectedVideo;

  setSong(selectedVideo);

  setNextSong(
    getNextQueueSong(
      data.queue,
      data.index
    )
  );

  if (
    selectedVideo.sourceType === "usb"
  ) {
    const bridge =
      getAndroidUsbBridge();

    if (!bridge?.playUsbVideo) {
      setStatus(
        "Android USB Player မချိတ်ရသေးပါ။"
      );
      return;
    }

    player.current?.stopVideo?.();
    startSongTransition(800);

    bridge.playUsbVideo(
      getUsbFileId(selectedVideo)
    );
    setTransitionMediaReady(true);

    setStatus(
      "USB သီချင်းဖွင့်နေသည်"
    );

    return;
  }

  if (
    !playerReadyRef.current ||
    !player.current
  ) {
    setStatus(
      "YouTube player loading…"
    );
    return;
  }

  getAndroidUsbBridge()
    ?.stopUsbVideo?.();

  playerUnlockedRef.current = true;
setPlayerUnlocked(true);
 startSongTransition(5000);

player.current.loadVideoById(
  selectedVideo.id
  );

setStatus("Remote connected");

  return;
          }
          if (type === "REQUEST_TV_STATE") {
  try {
    // TV မှာ လက်ရှိတကယ်ကိုင်ထားတဲ့ Now Playing
    const tvNowPlaying =
  normalizeVideo(pendingVideoRef.current) || null;

    // TV / Supabase ရဲ့ လက်ရှိ Queue ကိုဖတ်မယ်
    const { data: queueRows, error: queueError } =
      await supabase
        .from("karaoke_queue")
        .select("*")
        .eq("room_id", ROOM_ID)
        .order("position", { ascending: true })
        .order("id", { ascending: true });

    if (queueError) {
      throw queueError;
    }

    const tvQueue = (queueRows || []).map(queueRowToSong);

    await realtimeChannel.send({
      type: "broadcast",
      event: "tv-status",
      payload: {
        type: "TV_STATE",
        currentSong: tvNowPlaying,
        queue: tvQueue
      }
    });

    setStatus("Remote Adjust ပြီးပါပြီ");
  } catch (error) {
    console.error("TV state send error:", error);

    setStatus("Remote Adjust မအောင်မြင်ပါ");
  }

  return;
          }
          if (type === "REQUEST_USB_SONGS") {
  const bridge = getAndroidUsbBridge();

  if (!bridge?.getUsbSongs) {
    realtimeChannel.send({
      type: "broadcast",
      event: "tv-status",
      payload: {
        type: "USB_ERROR",
        message:
          "Android USB Bridge မချိတ်ရသေးပါ။"
      }
    });

    return;
  }

  try {
    const rawSongs =
      bridge.getUsbSongs();

    const songs =
      parseUsbSongs(rawSongs);

    await sendUsbSongsInChunks(
      realtimeChannel,
      songs
    );

    setStatus(
      `USB စာရင်း ${songs.length} ပုဒ် Remote သို့ ပို့ပြီးပါပြီ`
    );
  } catch (error) {
    realtimeChannel.send({
      type: "broadcast",
      event: "tv-status",
      payload: {
        type: "USB_ERROR",
        message:
          error?.message ||
          "USB သီချင်းစာရင်း ဖတ်မရပါ။"
      }
    });
  }

  return;
          }
          if (type === "SHOW_POPUP") {
  const bridge = getAndroidUsbBridge();

  if (bridge?.showImagePopup) {
    bridge.showImagePopup(
      `${window.location.origin}/1785761934011.png`,
      4000
    );
    return;
  }

  setShowPopup(true);

  window.setTimeout(() => {
    setShowPopup(false);
  }, 4000);

  return;
          }
          if (type === "START_SCENERY_SHOW") {
  setSceneryIndex(0);
  setSceneryShow(true);
  return;
}

if (type === "STOP_SCENERY_SHOW") {
  setSceneryShow(false);
  setSceneryIndex(0);
  return;
}
          if (type === "SHOW_TEXT_POPUP") {
  const message =
    typeof data.text === "string"
      ? data.text.trim()
      : "";

  if (!message) {
    return;
  }

  const durationSeconds = Math.min(
    18000,
    Math.max(
      4,
      Number(data.duration) || 4
    )
  );

  const bridge = getAndroidUsbBridge();

  if (bridge?.showTextPopup) {
    bridge.showTextPopup(
      message,
      durationSeconds * 1000
    );
    return;
  }

  setTextBannerMessage(message);
  setShowTextBanner(true);

  window.setTimeout(() => {
    setShowTextBanner(false);
    setTextBannerMessage("");
  }, durationSeconds * 1000);

  return;
          }
          if (type === "RE_SING") {
  const currentSourceType =
    getSourceType(pendingVideoRef.current);

  if (!pendingVideoRef.current) {
    setStatus("ပြန်ဆိုရန် သီချင်းမရှိပါ။");
    return;
  }

  if (currentSourceType === "usb") {
    const bridge = getAndroidUsbBridge();

    if (!bridge?.restartUsbVideo) {
      setStatus("USB Re-Sing မရသေးပါ။");
      return;
    }

    bridge.restartUsbVideo();

    setStatus("USB သီချင်းကို အစကနေ ပြန်ဆိုနေသည်");
    return;
  }

  if (
    !playerUnlockedRef.current ||
    !player.current
  ) {
    setStatus("Player အဆင်သင့်မဖြစ်သေးပါ။");
    return;
  }

  player.current.seekTo(0, true);
  player.current.playVideo();

  setStatus("သီချင်းကို အစကနေ ပြန်ဆိုနေသည်");
  return;
          }

        if (type === "PLAY") {
  if (getSourceType(pendingVideoRef.current) === "usb") {
    getAndroidUsbBridge()
      ?.resumeUsbVideo?.();

    return;
  }

  playerUnlockedRef.current = true;
  setPlayerUnlocked(true);

  player.current?.playVideo();
  return;
        }

          if (type === "PAUSE") {
  if (getSourceType(pendingVideoRef.current) === "usb") {
    getAndroidUsbBridge()
      ?.pauseUsbVideo?.();

    return;
  }

  player.current?.pauseVideo();
  return;
          }
if (type === "STOP") {
  const currentSourceType =
    getSourceType(pendingVideoRef.current);

  pendingVideoRef.current = null;
  setSong(null);
  window.clearTimeout(transitionTimerRef.current);
setTransitionCover(false);
setTransitionMinDone(false);
setTransitionMediaReady(false);

  if (currentSourceType === "usb") {
    getAndroidUsbBridge()
      ?.stopUsbVideo?.();
  } else {
    player.current?.stopVideo?.();
  }

  if (configured && supabase) {
    supabase.from("karaoke_state").upsert(
      {
        room_id: ROOM_ID,
        current_video_id: null,
        current_title: null,
        current_channel: null,
        current_thumbnail: null,
        is_playing: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "room_id" }
    );
  }

  setStatus("Remote connected");

  return;
}
        
          if (type === "VOLUME_UP") {
            if (getSourceType(pendingVideoRef.current) === "usb") {
  getAndroidUsbBridge()
    ?.volumeUpUsb?.();

  return;
            }
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
  if (getSourceType(pendingVideoRef.current) === "usb") {
  getAndroidUsbBridge()
    ?.volumeDownUsb?.();

  return;
  }
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
  if (getSourceType(pendingVideoRef.current) === "usb") {
  getAndroidUsbBridge()
    ?.toggleMuteUsb?.();

  return;
  }
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
            window.clearTimeout(transitionTimerRef.current);
setTransitionCover(false);
setTransitionMinDone(false);
setTransitionMediaReady(false);

  player.current?.stopVideo?.();

  getAndroidUsbBridge()
    ?.stopUsbVideo?.();

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
  function openQrPopup() {
  const bridge = getAndroidUsbBridge();

  if (bridge?.showQrPopup) {
    bridge.showQrPopup(
      `${window.location.origin}/remote-qr.png`,
      15000
    );
    return;
  }

  setShowQrPopup(true);

  window.setTimeout(() => {
    setShowQrPopup(false);
  }, 15000);
  }

  

  return (
    <main className={`tv-shell ${showTextBanner ? "has-announcement" : ""}`}>
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

  <span
    className="dancing-mic"
    aria-hidden="true"
  >
    🎤
  </span>
</h1>
        </div>

        <div className="tv-header-actions">
  <button
    type="button"
    className="qr-button"
    onClick={openQrPopup}
    aria-label="Open Remote QR Code"
    title="Open Remote QR Code"
  >
    🇲🇲
  </button>

  <span className="tv-status">{status}</span>
</div>
      </header>

{showTextBanner && (
  <div
    className="announcement-banner"
    role="status"
  >
    <div className="announcement-banner-glow" />

    <div className="announcement-banner-text">
      {textBannerMessage}
    </div>
  </div>
)}

<section className="screen">
        <div ref={playerHost} className="player" />
  {transitionCover && (
  <div className="song-transition-cover">
    <img
      src={standbyBanner}
      alt="Khin Thuzar Home Karaoke"
      className="song-transition-image"
    />
 </div>
)}

{!song && (
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
      {showPopup && (
  <div className="popup-overlay">
    <img
      src="/1785761934011.png"
      alt="Popup"
      className="popup-image"
    />
  </div>
)}
      {showQrPopup && (
  <div
    className="qr-overlay"
    onClick={() => setShowQrPopup(false)}
  >
    <div
      className="qr-popup"
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="qr-close-button"
        onClick={() => setShowQrPopup(false)}
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
)}
      {sceneryShow && (
  <div className="scenery-slideshow">
    <img
      key={sceneryImages[sceneryIndex]}
      src={sceneryImages[sceneryIndex]}
      alt=""
      className="scenery-slide-image"
    />
  </div>
)}
    </main>
  );
}
