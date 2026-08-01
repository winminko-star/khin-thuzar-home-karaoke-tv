import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({plugins:[react(),VitePWA({registerType:"autoUpdate",includeAssets:["icon-192.png","icon-512.png"],manifest:{name:"Khin Thuzar Hlaing's Home Karaoke TV",short_name:"Karaoke TV",theme_color:"#09090b",background_color:"#09090b",display:"standalone",start_url:"/",icons:[{src:"/icon-192.png",sizes:"192x192",type:"image/png"},{src:"/icon-512.png",sizes:"512x512",type:"image/png"}]}})]});
