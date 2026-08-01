import {useEffect,useRef,useState} from "react";import {configured,supabase} from "./lib/supabase";
const ROOM_ID=import.meta.env.VITE_KARAOKE_ROOM_ID||"wmk-home-karaoke";
export default function App(){const playerHost=useRef(null);const player=useRef(null);const channel=useRef(null);const [song,setSong]=useState(null);const [nextSong,setNextSong]=useState(null);const [status,setStatus]=useState(configured?"Connecting…":"Supabase not configured");
useEffect(()=>{window.onYouTubeIframeAPIReady=()=>{player.current=new window.YT.Player(playerHost.current,{width:"100%",height:"100%",playerVars:{autoplay:1,controls:1,rel:0,modestbranding:1,playsinline:1},events:{onReady:()=>setStatus("Remote ready"),onStateChange:(event)=>{if(event.data===window.YT.PlayerState.ENDED){channel.current?.send({type:"broadcast",event:"tv-status",payload:{type:"VIDEO_ENDED"}})}}}})};const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";document.body.appendChild(script);return()=>{window.onYouTubeIframeAPIReady=null;script.remove()}},[]);
useEffect(()=>{if(!configured)return;const ch=supabase.channel(`karaoke-room:${ROOM_ID}`,{config:{broadcast:{self:true}}});ch.on("broadcast",{event:"karaoke-command"},({payload})=>{const {type,payload:data={}}=payload||{};if(type==="LOAD_AND_PLAY"){setSong(data.video);setNextSong(data.queue?.[data.index+1]||null);player.current?.loadVideoById(data.video.id)}if(type==="PLAY")player.current?.playVideo();if(type==="PAUSE")player.current?.pauseVideo();if(type==="STOP")player.current?.stopVideo();if(type==="CLEAR_QUEUE"){setNextSong(null)}if(type==="SYNC_QUEUE"){setNextSong(data.queue?.[data.currentIndex+1]||null)}}).subscribe(async(s)=>{setStatus(s==="SUBSCRIBED"?"Remote connected":s);if(s==="SUBSCRIBED")await ch.send({type:"broadcast",event:"tv-status",payload:{type:"READY"}})});channel.current=ch;return()=>{supabase.removeChannel(ch);channel.current=null}},[]);
return <main className="tv-shell"><header className="tv-header">
  <div className="tv-title">
    <div className="tv-marquee">
      <span>
        KHIN THUZAR HLAING'S • KHIN THUZAR HLAING'S • KHIN THUZAR HLAING'S
      </span>
    </div>

    <h1>HOME KARAOKE 🎤</h1>
  </div>

  <span className="tv-status">{status}</span>
</header><section className="screen"><div ref={playerHost} className="player"/>{!song&&<div className="standby"><div>🎤</div><h2>Ready to Sing</h2><p>Remote App ကနေ သီချင်းရွေးပါ</p></div>}</section><footer><div><small>NOW PLAYING</small><strong>{song?.title||"Waiting for song…"}</strong><span>{song?.channel||""}</span></div><div className="next"><small>NEXT</small><strong>{nextSong?.title||"Queue empty"}</strong></div></footer></main>}
