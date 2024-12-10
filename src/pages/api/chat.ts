import type { NextApiRequest, NextApiResponse } from "next";
import {
  createPagesServerClient,
  SupabaseClient,
} from "@supabase/auth-helpers-nextjs";

import { finalText as demoFinalText } from "./demo-chat-content";

// Function to chunk text into smaller pieces
const chunkText = (text: string, chunkSize: number = 100): string[] => {
  const words = text.split(" ");
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }

  return chunks;
};

// Function to broadcast chunks with delay
const broadcastWithDelay = async (
  channel: any,
  chunks: string[],
  interactionId: string,
  delay: number = 100
) => {
  for (let index = 0; index < chunks.length; index++) {
    const chunk = chunks[index];
    await channel.send({
      type: "broadcast",
      event: "chat",
      payload: {
        event: "response",
        token: chunk,
        interactionId,
      },
    });

    // Add small delay between chunks
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
};

const handleRequest = async ({
  prompt,
  userId,
  supabaseAuthedClient,
}: {
  prompt: string;
  userId: string;
  supabaseAuthedClient: SupabaseClient;
}) => {
  try {
    const channel = supabaseAuthedClient.channel(userId);
    const { data } = await supabaseAuthedClient
      .from("conversations")
      .insert({ speaker: "ai", user_id: userId })
      .select()
      .single()
      .throwOnError();
    const interactionId = data?.id;

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Initial status message
        await channel.send({
          type: "broadcast",
          event: "chat",
          payload: {
            event: "status",
            message: "Finding matches...",
          },
        });

        // Update conversation in database
        await supabaseAuthedClient
          .from("conversations")
          .update({ entry: demoFinalText })
          .eq("id", interactionId);

        // Demo Wait Time
        await new Promise((resolve) => setTimeout(resolve, 2800));

        // Split the final text into chunks and broadcast them
        const textChunks = chunkText(demoFinalText);
        await broadcastWithDelay(channel, textChunks, interactionId);

        // Send end message
        await channel.send({
          type: "broadcast",
          event: "chat",
          payload: {
            event: "responseEnd",
            token: "END",
            interactionId,
          },
        });
      }
    });
  } catch (error) {
    console.error("Error in handleRequest:", error);
    console.error(
      "Something went wrong with request handling:",
      (error as Error).message
    );
  }
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Create authenticated Supabase Client
  const supabase = createPagesServerClient(
    { req, res },
    {
      options: {
        realtime: {
          params: {
            eventsPerSecond: -1,
          },
        },
      },
    }
  );

  // Check if we have a session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session)
    return res.status(401).json({
      error: "not_authenticated",
      description:
        "The user does not have an active session or is not authenticated",
    });

  // Run queries with RLS on the server
  const { body } = req;
  const { prompt } = body;

  await handleRequest({
    prompt,
    userId: session.user.id,
    supabaseAuthedClient: supabase,
  });

  res.status(200).json({ message: "started" });
}
