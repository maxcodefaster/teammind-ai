import { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { Database } from "../../../types/supabase";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL}/api/atlassian/callback`;

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

    // Generate the authorization URL
    const authUrl = new URL("https://auth.atlassian.com/authorize");
    authUrl.searchParams.append("audience", "api.atlassian.com");
    authUrl.searchParams.append("client_id", ATLASSIAN_CLIENT_ID);
    authUrl.searchParams.append(
      "scope",
      ["read:me", "read:confluence-space.summary", "offline_access"].join(" ")
    );
    authUrl.searchParams.append("redirect_uri", REDIRECT_URI);
    authUrl.searchParams.append("state", session.user.id);
    authUrl.searchParams.append("response_type", "code");
    authUrl.searchParams.append("prompt", "consent");

    res.status(200).json({ url: authUrl.toString() });
  } catch (error) {
    console.error("Error initiating Atlassian connection:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
