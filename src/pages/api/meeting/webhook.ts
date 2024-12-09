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
import { createJiraIssuesFromActionItems } from "../../../utils/jira";
import { Database } from "../../../types/supabase";

type AtlassianConfig = Database["public"]["Tables"]["atlassian_config"]["Row"];
type MeetingBot = Database["public"]["Tables"]["meeting_bots"]["Row"];

interface BotDataWithConfig extends MeetingBot {
  users: {
    atlassian_config: AtlassianConfig[];
  };
}

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

const systemPrompt = `You will be analyzing a meeting transcript to create documentation and tasks. Here is the transcript:
<transcript>
{{TRANSCRIPT}}
</transcript>

Your task is to extract and organize information for both Confluence documentation and Jira tasks:

1. Meeting Documentation (for Confluence):
   - Write a brief summary of the meeting (2-3 sentences)
   - List the key discussion points and decisions made
   - Highlight important outcomes and agreements

2. Action Items (for Jira Tasks):
   - Identify specific tasks, assignments, and commitments made during the meeting
   - For each action item, determine:
     a. A clear, concise title suitable for a Jira task
     b. A detailed description explaining what needs to be done
     c. The assignee (if mentioned)
     d. The priority level (if mentioned, categorize as High, Medium, or Low)
     e. The due date (if mentioned, format as YYYY-MM-DD)

3. Formatting the Output:
   Format your response in JSON as follows:
   {
     "confluenceContent": {
       "summary": "string",
       "keyPoints": ["string"],
       "decisions": ["string"]
     },
     "jiraTasks": [
       {
         "title": "string",
         "description": "string",
         "assignee": "string" (optional),
         "priority": "High|Medium|Low" (optional),
         "dueDate": "YYYY-MM-DD" (optional)
       }
     ]
   }

Focus on creating clear, actionable Jira tasks and comprehensive Confluence documentation that captures the meeting's essence and outcomes.`;

function processTranscript(
  rawTranscript: WebhookPayload["data"]["transcript"]
): {
  speakers: string[];
  transcript: Array<{ speaker: string; text: string }>;
} {
  if (!rawTranscript) return { speakers: [], transcript: [] };

  return {
    speakers: Array.from(
      new Set(rawTranscript.map((segment) => segment.speaker))
    ).sort(),
    transcript: rawTranscript.map(
      (segment: { speaker: string; words: Array<{ word: string }> }) => ({
        speaker: segment.speaker,
        text: segment.words
          .map((word) => word.word)
          .join(" ")
          .replace(" - ", "-")
          .replace(/\s+/g, " ")
          .trim(),
      })
    ),
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
    return JSON.parse(content) as {
      confluenceContent: {
        summary: string;
        keyPoints: string[];
        decisions: string[];
      };
      jiraTasks: Array<{
        title: string;
        description: string;
        assignee?: string;
        priority?: string;
        dueDate?: string;
      }>;
    };
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

async function handleTranscriptProcessing(
  processedTranscript: ReturnType<typeof processTranscript>,
  botData: BotDataWithConfig,
  atlassianConfig: AtlassianConfig
) {
  // Analyze transcript with Claude
  const analysis = await analyzeTranscriptWithClaude(processedTranscript);

  // Find relevant documents
  const relevantDocs = await findRelevantDocuments(
    analysis.confluenceContent.summary
  );

  // Create or update Confluence pages
  const updatedPages = [];
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
        analysis.confluenceContent.summary,
        analysis.jiraTasks,
        analysis.confluenceContent.keyPoints,
        analysis.confluenceContent.decisions
      );

      // Store original and updated content
      await supabaseAdminClient.from("document_changes").insert({
        meeting_bot_id: botData.id,
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

      updatedPages.push({
        id: doc.metadata.confluence_id,
        title: page.title,
        relevance: doc.metadata.relevance || 1,
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
        analysis.confluenceContent.summary,
        analysis.jiraTasks,
        analysis.confluenceContent.keyPoints,
        analysis.confluenceContent.decisions
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
        meeting_bot_id: botData.id,
        confluence_page_id: newPage.id,
        confluence_page_title: newPage.title,
        original_content: null,
        updated_content: newContent,
        status: "applied",
      });

      updatedPages.push({
        id: newPage.id,
        title: newPage.title,
        relevance: 1,
      });
    } catch (error) {
      console.error("Failed to create new page:", error);
    }
  }

  // Create Jira issues with links to relevant Confluence pages
  if (atlassianConfig.jira_project_key) {
    try {
      await createJiraIssuesFromActionItems(
        analysis.jiraTasks,
        botData.user_id,
        updatedPages
      );
    } catch (error) {
      console.error("Failed to create Jira issues:", error);
    }
  }
}

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

          // Handle transcript processing
          await handleTranscriptProcessing(
            processedTranscript,
            typedBotData,
            atlassianConfig
          );

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
