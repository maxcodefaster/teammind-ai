import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import type { NextApiRequest, NextApiResponse } from "next";
import { summarizeLongDocument } from "./summarizer";
import {
  createPagesServerClient,
  SupabaseClient,
} from "@supabase/auth-helpers-nextjs";
import { AIMessageChunk } from "@langchain/core/messages";

import { ConversationLog } from "./conversationLog";
import { Metadata, getMatchesFromEmbeddings } from "./matches";
import { templates } from "./templates";
import { LLMResult } from "@langchain/core/outputs";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
});

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

    // Retrieve the conversation log and save the user's prompt
    const conversationLog = new ConversationLog(userId);
    const conversationHistory = await conversationLog.getConversation({
      limit: 10,
    });
    await conversationLog.addEntry({ entry: prompt, speaker: "user" });

    // Build an inquiry chain using LCEL
    const inquiryPrompt = PromptTemplate.fromTemplate(
      templates.inquiryTemplate
    );
    const inquiryChain = inquiryPrompt.pipe(llm);
    const inquiryResponse = await inquiryChain.invoke({
      userPrompt: prompt,
      conversationHistory,
    });
    const inquiryResult = (
      inquiryResponse as AIMessageChunk
    ).content.toString();

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.send({
          type: "broadcast",
          event: "chat",
          payload: {
            event: "status",
            message: "Finding matches...",
          },
        });

        // Increased number of matches to get more context
        const matches = await getMatchesFromEmbeddings(
          inquiryResult,
          supabaseAuthedClient,
          10
        );

        const urls =
          matches &&
          Array.from(
            new Set(
              matches.map((match) => {
                const metadata = match.metadata as Metadata;
                const { url } = metadata;
                return url;
              })
            )
          );

        console.log("Found URLs:", urls);
        console.log("Inquiry Result:", inquiryResult);

        const docs =
          matches &&
          Array.from(
            matches.reduce((map, match) => {
              const metadata = match.metadata as Metadata;
              const { text, url } = metadata;
              if (!map.has(url)) {
                map.set(url, text);
              }
              return map;
            }, new Map())
          ).map(([_, text]) => text);

        const qaPrompt = PromptTemplate.fromTemplate(templates.qaTemplate);

        let i = 0;
        const chat = new ChatOpenAI({
          streaming: true,
          verbose: true,
          modelName: "gpt-4o-mini",
          temperature: 0.2, // Reduced temperature for more focused answers
          callbacks: [
            {
              handleLLMNewToken: async (token: string) => {
                await channel.send({
                  type: "broadcast",
                  event: "chat",
                  payload: {
                    event: "response",
                    token,
                    interactionId,
                  },
                });
              },
              handleLLMEnd: async (result: LLMResult) => {
                try {
                  if (!result?.generations?.[0]?.[0]?.text) {
                    throw new Error("Invalid LLM response structure");
                  }

                  const finalText = result.generations[0][0].text;
                  // Store answer in DB
                  await supabaseAuthedClient
                    .from("conversations")
                    .update({ entry: finalText })
                    .eq("id", interactionId);
                  await channel.send({
                    type: "broadcast",
                    event: "chat",
                    payload: {
                      event: "responseEnd",
                      token: "END",
                      interactionId,
                    },
                  });
                } catch (error) {
                  console.error("Error in handleLLMEnd:", error);
                  // Send error message to client
                  await channel.send({
                    type: "broadcast",
                    event: "chat",
                    payload: {
                      event: "error",
                      message:
                        "An error occurred while processing the response",
                      interactionId,
                    },
                  });
                }
              },
            },
          ],
        });

        // Create chain using LCEL
        const chain = qaPrompt.pipe(chat);

        const allDocs = docs.join("\n");
        if (allDocs.length > 6000) {
          await channel.send({
            type: "broadcast",
            event: "chat",
            payload: {
              event: "status",
              message: `Processing large amount of context...`,
            },
          });
        }

        // Increased threshold for summarization to preserve more context
        const summary =
          allDocs.length > 8000
            ? await summarizeLongDocument({
                document: allDocs,
                inquiry: inquiryResult,
              })
            : allDocs;

        console.log("Context length:", summary.length);

        await chain.invoke({
          summaries: summary,
          question: prompt,
          conversationHistory,
          urls,
        });
      }
    });
  } catch (error) {
    //@ts-ignore
    console.error(error);
    // @ts-ignore
    console.error("Something went wrong with OpenAI: ", error.message);
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
