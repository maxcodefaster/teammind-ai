import { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdminClient } from "../../../utils/supabaseAdmin";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { TokenTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";
import Anthropic from "@anthropic-ai/sdk";
import {
  getConfluencePage,
  updateConfluencePage,
  createConfluencePage,
  generateUpdatedContent,
} from "../../../utils/confluence";

interface WebhookPayload {
  event: string;
  data: {
    bot_id: string;
    status?: {
      code: string;
    };
    transcript?: {
      speaker: string;
      words: Array<{
        word: string;
      }>;
    }[];
    error?: string;
  };
}

interface BotDataWithConfig {
  id: string;
  user_id: string;
  bot_id: string;
  bot_name: string;
  meeting_url: string;
  status: string;
  created_at: string;
  updated_at: string;
  users: {
    atlassian_config: Array<{
      id: string;
      user_id: string;
      api_key: string;
      space_key: string | null;
      base_url: string;
      email: string;
      created_at: string;
      updated_at: string;
    }>;
  };
}

const systemPrompt = `You will be analyzing a meeting transcript and extracting specific information from it. Here is the transcript:
<transcript>
{{TRANSCRIPT}}
</transcript>

Your task is to extract the following information from the transcript:
1. Action items with clear titles, descriptions, and if mentioned: assignees, priority levels, and due dates
2. A brief summary of the meeting (2-3 sentences)
3. Key discussion points

Follow these steps to complete the task:

1. Extracting Action Items:
   - Carefully read through the transcript and identify any tasks, assignments, or commitments made during the meeting.
   - For each action item, determine:
     a. A clear, concise title
     b. A detailed description
     c. The assignee (if mentioned)
     d. The priority level (if mentioned, categorize as High, Medium, or Low)
     e. The due date (if mentioned, format as YYYY-MM-DD)

2. Writing a Summary:
   - After analyzing the transcript, write a brief summary of the meeting in 2-3 sentences.
   - Focus on the main purpose of the meeting and the most important outcomes or decisions.

3. Identifying Key Discussion Points:
   - List the main topics or issues that were discussed during the meeting.
   - Focus on points that were given significant attention or led to important decisions.

4. Formatting the Output:
   Format your response in JSON as follows:
   {
     "actionItems": [
       {
         "title": "string",
         "description": "string",
         "assignee": "string" (optional),
         "priority": "High|Medium|Low" (optional),
         "dueDate": "YYYY-MM-DD" (optional)
       }
     ],
     "summary": "string",
     "keyPoints": ["string"]
   }`;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const payload = req.body as WebhookPayload;
  const botId = payload.data.bot_id;

  // Get bot data from database with proper typing
  const { data: botData, error: botError } = await supabaseAdminClient
    .from("meeting_bots")
    .select("*, users!inner(atlassian_config(*))")
    .eq("bot_id", botId)
    .single();

  if (botError || !botData) {
    console.error("Bot not found:", botError);
    return res.status(404).json({ error: "Bot not found" });
  }

  const typedBotData = botData as unknown as BotDataWithConfig;
  const atlassianConfig = typedBotData.users?.atlassian_config?.[0];

  if (!atlassianConfig) {
    console.error("Atlassian config not found for user");
    return res.status(400).json({ error: "Atlassian configuration not found" });
  }

  switch (payload.event) {
    case "bot.status_change":
      // Update bot status
      await supabaseAdminClient
        .from("meeting_bots")
        .update({ status: payload.data.status?.code })
        .eq("bot_id", botId);
      break;

    case "complete":
      if (payload.data.transcript) {
        try {
          // Process transcript
          const processedTranscript = processTranscript(
            payload.data.transcript
          );

          // Analyze transcript with Claude
          const analysis = await analyzeTranscriptWithClaude(
            processedTranscript
          );

          // Find relevant documents
          const relevantDocs = await findRelevantDocuments(analysis.summary);

          // Update or create Confluence pages
          for (const doc of relevantDocs) {
            try {
              // Get current page content
              const page = await getConfluencePage(
                atlassianConfig.base_url,
                atlassianConfig.api_key,
                doc.metadata.confluence_id
              );

              // Generate updated content
              const updatedContent = generateUpdatedContent(
                page.body.storage.value,
                analysis.summary,
                analysis.actionItems,
                analysis.keyPoints
              );

              // Store original and updated content
              await supabaseAdminClient.from("document_changes").insert({
                meeting_bot_id: typedBotData.id,
                confluence_page_id: doc.metadata.confluence_id,
                confluence_page_title: doc.metadata.title,
                original_content: page.body.storage.value,
                updated_content: updatedContent,
                status: "pending",
              });

              // Update the page
              await updateConfluencePage({
                baseUrl: atlassianConfig.base_url,
                apiKey: atlassianConfig.api_key,
                pageId: doc.metadata.confluence_id,
                title: page.title,
                content: updatedContent,
                version: page.version.number,
              });
            } catch (error) {
              console.error(
                `Failed to update page ${doc.metadata.confluence_id}:`,
                error
              );
            }
          }

          // If no relevant docs found, create a new page
          if (relevantDocs.length === 0) {
            try {
              const newContent = generateUpdatedContent(
                "",
                analysis.summary,
                analysis.actionItems,
                analysis.keyPoints
              );

              const date = new Date().toISOString().split("T")[0];
              const newPage = await createConfluencePage({
                baseUrl: atlassianConfig.base_url,
                apiKey: atlassianConfig.api_key,
                spaceKey: atlassianConfig.space_key || "",
                title: `Meeting Notes - ${date}`,
                content: newContent,
              });

              // Store the change
              await supabaseAdminClient.from("document_changes").insert({
                meeting_bot_id: typedBotData.id,
                confluence_page_id: newPage.id,
                confluence_page_title: newPage.title,
                original_content: null,
                updated_content: newContent,
                status: "applied",
              });
            } catch (error) {
              console.error("Failed to create new page:", error);
            }
          }

          // Update bot status
          await supabaseAdminClient
            .from("meeting_bots")
            .update({ status: "completed" })
            .eq("bot_id", botId);
        } catch (error) {
          console.error("Failed to process transcript:", error);
          await supabaseAdminClient
            .from("meeting_bots")
            .update({ status: "failed" })
            .eq("bot_id", botId);
        }
      }
      break;

    case "failed":
      console.error(`Bot ${botId} failed with error:`, payload.data.error);
      await supabaseAdminClient
        .from("meeting_bots")
        .update({ status: "failed" })
        .eq("bot_id", botId);
      break;

    default:
      console.warn(`Received unknown event type: ${payload.event}`);
      return res.status(400).json({ error: "Unknown event type" });
  }

  return res.status(200).json({ success: true });
}

function processTranscript(
  rawTranscript: WebhookPayload["data"]["transcript"]
) {
  if (!rawTranscript) return { speakers: [], transcript: [] };

  return {
    speakers: Array.from(
      new Set(rawTranscript.map((segment) => segment.speaker))
    ).sort(),
    transcript: rawTranscript.map((segment) => ({
      speaker: segment.speaker,
      text: segment.words
        .map((word) => word.word)
        .join(" ")
        .replace(" - ", "-")
        .replace(/\s+/g, " ")
        .trim(),
    })),
  };
}

async function analyzeTranscriptWithClaude(
  processedTranscript: ReturnType<typeof processTranscript>
) {
  const formattedTranscript = processedTranscript.transcript
    .map((segment) => `${segment.speaker}: ${segment.text}`)
    .join("\n");

  const prompt = systemPrompt.replace("{{TRANSCRIPT}}", formattedTranscript);

  try {
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });

    const response = await anthropic.messages.create({
      max_tokens: 1024,
      model: "claude-3-haiku-20240307",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = (response.content[0] as any).text as string;
    return JSON.parse(content);
  } catch (error) {
    console.error("Error analyzing transcript with Claude:", error);
    throw new Error("Failed to analyze transcript");
  }
}

async function findRelevantDocuments(query: string) {
  const embeddings = new OpenAIEmbeddings();
  const store = new SupabaseVectorStore(embeddings, {
    client: supabaseAdminClient,
    tableName: "documents",
  });

  // Split query into chunks if needed
  const splitter = new TokenTextSplitter({
    encodingName: "gpt2",
    chunkSize: 300,
    chunkOverlap: 20,
  });

  const queryDoc = new Document({ pageContent: query });
  const queryChunks = await splitter.splitDocuments([queryDoc]);

  // Search for similar documents using each chunk
  const results = await Promise.all(
    queryChunks.map((chunk) => store.similaritySearch(chunk.pageContent, 5))
  );

  // Flatten and deduplicate results
  const uniqueDocs = new Map();
  results.flat().forEach((doc) => {
    if (!uniqueDocs.has(doc.metadata.confluence_id)) {
      uniqueDocs.set(doc.metadata.confluence_id, doc);
    }
  });

  return Array.from(uniqueDocs.values());
}
