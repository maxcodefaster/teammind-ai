import { NextApiRequest, NextApiResponse } from "next";
import { supabaseAdminClient } from "../../../utils/supabaseAdmin";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { TokenTextSplitter } from "langchain/text_splitter";
import { Document } from "langchain/document";

// Vercel cron jobs are authenticated using a secret token
const CRON_SECRET = process.env.CRON_SECRET!;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Verify the request is from Vercel cron
  if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Get all Atlassian configs to check each user's documents
    const { data: configs, error: configError } = await supabaseAdminClient
      .from("atlassian_config")
      .select("*");

    if (configError) throw configError;

    // Initialize vector store
    const embeddings = new OpenAIEmbeddings();
    const store = new SupabaseVectorStore(embeddings, {
      client: supabaseAdminClient,
      tableName: "documents",
    });

    for (const config of configs) {
      try {
        // Fetch documents from Confluence
        const response = await fetch(
          `${config.base_url}/wiki/api/v2/spaces/${config.space_key}/pages`,
          {
            headers: {
              Authorization: `Bearer ${config.api_key}`,
              Accept: "application/json",
            },
          }
        );

        if (!response.ok) {
          console.error(
            `Failed to fetch pages for user ${config.user_id}:`,
            await response.text()
          );
          continue;
        }

        const data = await response.json();
        const pages = data.results;

        // Process each page
        for (const page of pages) {
          // Get current document from vector store
          const { data: existingDocs } = await supabaseAdminClient
            .from("documents")
            .select("*")
            .eq("metadata->>confluence_id", page.id)
            .single();

          // Get current page content
          const contentResponse = await fetch(
            `${config.base_url}/wiki/api/v2/pages/${page.id}`,
            {
              headers: {
                Authorization: `Bearer ${config.api_key}`,
                Accept: "application/json",
              },
            }
          );

          if (!contentResponse.ok) {
            console.error(
              `Failed to fetch content for page ${page.id}:`,
              await contentResponse.text()
            );
            continue;
          }

          const contentData = await contentResponse.json();
          const pageContent = contentData.body.storage.value;

          // If document exists and content hasn't changed, skip
          if (existingDocs && existingDocs.content === pageContent) {
            continue;
          }

          // Split content into chunks
          const splitter = new TokenTextSplitter({
            encodingName: "gpt2",
            chunkSize: 300,
            chunkOverlap: 20,
          });

          const doc = new Document({
            pageContent,
            metadata: {
              confluence_id: page.id,
              title: page.title,
              url: page._links.webui,
              space_key: config.space_key,
              user_id: config.user_id,
            },
          });

          const docs = await splitter.splitDocuments([doc]);

          // If document exists, delete old version
          if (existingDocs) {
            await supabaseAdminClient
              .from("documents")
              .delete()
              .eq("metadata->>confluence_id", page.id);
          }

          // Add new document chunks to vector store
          await store.addDocuments(docs);
        }
      } catch (error) {
        console.error(
          `Error processing documents for user ${config.user_id}:`,
          error
        );
      }
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error updating documents:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
