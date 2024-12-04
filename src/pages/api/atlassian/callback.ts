import { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { Database } from "../../../types/supabase";

const ATLASSIAN_CLIENT_ID = process.env.ATLASSIAN_CLIENT_ID!;
const ATLASSIAN_CLIENT_SECRET = process.env.ATLASSIAN_CLIENT_SECRET!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_BASE_URL}/api/atlassian/callback`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { code, state } = req.query;

  if (!code || !state) {
    return res.status(400).json({ error: "Missing required parameters" });
  }

  try {
    const supabase = createPagesServerClient<Database>({ req, res });

    // Exchange code for token (temporary, just to get user info)
    const tokenResponse = await fetch(
      "https://auth.atlassian.com/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: ATLASSIAN_CLIENT_ID,
          client_secret: ATLASSIAN_CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenData);
      res.redirect("/connect?error=token_exchange_failed");
      return;
    }

    // Get Atlassian site URL
    const accessibleResourcesResponse = await fetch(
      "https://api.atlassian.com/oauth/token/accessible-resources",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: "application/json",
        },
      }
    );

    const accessibleResources = await accessibleResourcesResponse.json();
    const siteUrl = accessibleResources[0]?.url;

    if (!siteUrl) {
      res.redirect("/connect?error=no_resources");
      return;
    }

    // Get user email from Atlassian
    const userResponse = await fetch("https://api.atlassian.com/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    const userData = await userResponse.json();
    const email = userData.email;

    // Redirect back to connect page with the site URL and email
    // These will be used to pre-fill the form, but user still needs to enter API key
    res.redirect(
      `/connect?step=api_key&email=${encodeURIComponent(
        email
      )}&baseUrl=${encodeURIComponent(siteUrl)}`
    );
  } catch (error) {
    console.error("Error handling Atlassian callback:", error);
    res.redirect("/connect?error=callback_failed");
  }
}
