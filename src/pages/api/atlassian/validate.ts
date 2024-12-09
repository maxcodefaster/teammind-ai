import { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { Database } from "../../../types/supabase";
import { getConfluenceSpaces } from "../../../utils/confluence";
import { getJiraProjects } from "../../../utils/jira";

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

    // Fetch both Confluence spaces and Jira projects in parallel
    const [spaces, projects] = await Promise.all([
      getConfluenceSpaces(baseUrl, email, apiKey),
      getJiraProjects(baseUrl, email, apiKey),
    ]);

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

    return res.status(200).json({ spaces, projects });
  } catch (error) {
    console.error("Error validating API key:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
