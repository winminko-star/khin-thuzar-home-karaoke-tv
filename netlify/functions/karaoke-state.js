export default async (request) => {
  try {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
    const ROOM_ID =
      process.env.VITE_KARAOKE_ROOM_ID || "wmk-home-karaoke";

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return new Response(
        JSON.stringify({
          error: "Supabase environment variables missing"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json"
          }
        }
      );
    }

    const url =
      `${SUPABASE_URL}/rest/v1/karaoke_state` +
      `?room_id=eq.${encodeURIComponent(ROOM_ID)}&select=*`;

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      }
    });

    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });

  } catch (error) {
    console.error("karaoke-state function error:", error);

    return new Response(
      JSON.stringify({
        error: error.message
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json"
        }
      }
    );
  }
};
