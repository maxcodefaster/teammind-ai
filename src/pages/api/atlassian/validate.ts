import { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { Database } from "../../../types/supabase";

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

    const { apiKey, email, baseUrl } = req.body;

    if (!apiKey || !email || !baseUrl) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Fetch available spaces
    const spacesResponse = await fetch(`${baseUrl}/rest/api/space`, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString(
          "base64"
        )}`,
        Accept: "application/json",
      },
    });

    const spacesData = await spacesResponse.json();
    const spaces = spacesData.results.map((space: any) => ({
      key: space.key,
      name: space.name,
    }));

    // Save the API key, email, and base URL
    await supabase.from("atlassian_config").upsert(
      {
        user_id: session.user.id,
        email,
        api_key: apiKey,
        base_url: baseUrl,
      },
      {
        onConflict: "user_id",
      }
    );

    return res.status(200).json({ spaces });
  } catch (error) {
    console.error("Error validating API key:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
