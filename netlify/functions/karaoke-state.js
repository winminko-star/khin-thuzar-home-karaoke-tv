exports.handler = async function () {
  try {
    const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
    const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
    const ROOM_ID =
      process.env.VITE_KARAOKE_ROOM_ID || "KHIN-THUZAR-HOME-KARAOKE";

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Supabase environment variables missing"
        })
      };
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

    const text = await response.text();

    return {
      statusCode: response.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      },
      body: text
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
