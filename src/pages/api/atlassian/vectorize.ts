import { NextApiRequest, NextApiResponse } from "next";
import { createPagesServerClient } from "@supabase/auth-helpers-nextjs";
import { Database } from "../../../types/supabase";
import { ConfluencePagesLoader } from "@langchain/community/document_loaders/web/confluence";
import { SupabaseVectorStore } from "@langchain/community/vectorstores/supabase";
import { OpenAIEmbeddings } from "@langchain/openai";
import { TokenTextSplitter } from "langchain/text_splitter";
import { supabaseAdminClient } from "utils/supabaseAdmin";
import { Document } from "langchain/document";
import { summarizeLongDocument } from "../summarizer";

// The TextEncoder instance enc is created and its encode() method is called on the input string.
// The resulting Uint8Array is then sliced, and the TextDecoder instance decodes the sliced array in a single line of code.
const truncateStringByBytes = (str: string, bytes: number) => {
  const enc = new TextEncoder();
  return new TextDecoder("utf-8").decode(enc.encode(str).slice(0, bytes));
};

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

    const { spaceKey, summarize = false } = req.body;

    if (!spaceKey) {
      return res.status(400).json({ error: "Missing space key" });
    }

    // Get the user's Atlassian config
    const { data: configData, error: configError } = await supabase
      .from("atlassian_config")
      .select("*")
      .eq("user_id", session.user.id)
      .single();

    if (configError || !configData) {
      return res
        .status(400)
        .json({ error: "Atlassian configuration not found" });
    }

    // Update the space key
    await supabase
      .from("atlassian_config")
      .update({ space_key: spaceKey })
      .eq("user_id", session.user.id);

    // Initialize Confluence loader with email and API key
    const loader = new ConfluencePagesLoader({
      baseUrl: configData.base_url + "/wiki",
      spaceKey,
      username: configData.email,
      accessToken: configData.api_key,
      limit: 1000,
    });

    // Load documents
    const documents = await loader.load();

    // Initialize vector store with OpenAI embeddings
    const embeddings = new OpenAIEmbeddings();
    const store = new SupabaseVectorStore(embeddings, {
      client: supabaseAdminClient,
      tableName: "documents",
    });

    // Process each document
    const documentCollection = await Promise.all(
      documents.map(async (doc) => {
        const splitter = new TokenTextSplitter({
          encodingName: "gpt2",
          chunkSize: 300,
          chunkOverlap: 20,
        });

        const pageContent = summarize
          ? await summarizeLongDocument({ document: doc.pageContent })
          : doc.pageContent;

        const docs = splitter.splitDocuments([
          new Document({
            pageContent,
            metadata: {
              url: doc.metadata.source || "",
              text: truncateStringByBytes(pageContent, 36000),
              ...doc.metadata,
            },
          }),
        ]);
        return docs;
      })
    );

    try {
      await Promise.all(
        documentCollection.map(async (documents) => {
          await store.addDocuments(documents);
        })
      );
      console.log("Process has completed");
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("Error storing documents:", error);
      return res.status(500).json({ error: "Error storing documents" });
    }
  } catch (error) {
    console.error("Error vectorizing content:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
