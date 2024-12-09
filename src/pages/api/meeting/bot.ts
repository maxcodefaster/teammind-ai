import { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { Database } from "../../../types/supabase";

const MEETING_API_URL = process.env.MEETING_API_URL!;
const MEETING_API_KEY = process.env.MEETING_API_KEY!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = createPagesServerClient<Database>({ req, res });
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { meeting_url } = req.body;

    if (!meeting_url) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Get webhook URL based on current request URL
    const requestUrl = new URL(req.url!, `https://${req.headers.host}`);
    const webhookUrl = `${requestUrl.origin}/api/meeting/webhook`;

    // Create bot via meeting API
    const response = await fetch(`${MEETING_API_URL}/bots`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-spoke-api-key": MEETING_API_KEY,
      },
      body: JSON.stringify({
        meeting_url,
        bot_name: "TeamMind AI",
        webhook_url: webhookUrl,
        reserved: false,
        recording_mode: "audio_only",
        speech_to_text: "Gladia",
        bot_image: "https://summarify-mvp.pages.dev/summarify-bot-img.png",
      }),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error("Failed to parse response:", e);
      return res.status(502).json({ error: "Invalid response from bot API" });
    }

    if (!response.ok) {
      console.error("Bot API error:", data);
      return res.status(response.status).json({
        error: `Bot creation failed: ${data.message || "Unknown error"}`,
      });
    }

    if (!data.bot_id) {
      console.error("Missing bot_id in response:", data);
      return res.status(502).json({ error: "Invalid response from bot API" });
    }

    // Store bot data in database
    const { error: dbError } = await supabase.from("meeting_bots").insert({
      user_id: session.user.id,
      bot_id: data.bot_id,
      bot_name: "TeamMind AI",
      meeting_url,
      status: "pending",
    });

    if (dbError) {
      console.error("Database error:", dbError);
      return res.status(500).json({ error: "Failed to store bot data" });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("Bot creation error:", error);
    return res.status(500).json({
      error: "Failed to create bot: " + (error as Error).message,
    });
  }
}
