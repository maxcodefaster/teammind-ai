import { ChatOpenAI } from "@langchain/openai";
import { templates } from "./templates";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.3,
  maxConcurrency: 5,
});

const { summarizerTemplate, summarizerDocumentTemplate } = templates;

// Default max size for chunks (12K tokens minus template length)
const DEFAULT_MAX_SIZE = 12000;

// Optimized chunk splitting with larger chunks
const chunkSubstr = (str: string, size: number) => {
  const paragraphs = str.split("\n\n");
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length <= size) {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk);
      }
      // For long paragraphs, split on sentences
      if (paragraph.length > size) {
        const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
        let sentenceChunk = "";
        for (const sentence of sentences) {
          if ((sentenceChunk + sentence).length <= size) {
            sentenceChunk += sentence;
          } else {
            if (sentenceChunk) {
              chunks.push(sentenceChunk);
            }
            sentenceChunk = sentence;
          }
        }
        if (sentenceChunk) {
          chunks.push(sentenceChunk);
        }
      } else {
        chunks.push(paragraph);
      }
      currentChunk = "";
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
};

const summarize = async ({
  document,
  inquiry,
  onSummaryDone,
}: {
  document: string;
  inquiry?: string;
  onSummaryDone?: Function;
}) => {
  const promptTemplate = ChatPromptTemplate.fromTemplate(
    inquiry ? summarizerTemplate : summarizerDocumentTemplate
  );

  const chain = promptTemplate.pipe(llm).pipe(new StringOutputParser());

  try {
    const result = await chain.invoke({
      document,
      inquiry,
    });

    onSummaryDone && onSummaryDone(result);
    return result;
  } catch (e) {
    console.log("Summarization error:", e);
    return document;
  }
};

// Batch process chunks for better performance
const processBatch = async (chunks: string[], inquiry?: string) => {
  const batchSize = 3; // Process 3 chunks at a time
  const results: string[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((chunk) => summarize({ document: chunk, inquiry }))
    );
    results.push(...batchResults);
  }

  return results.join("\n\n");
};

const summarizeLongDocument = async ({
  document,
  inquiry,
  onSummaryDone,
}: {
  document: string;
  inquiry?: string;
  onSummaryDone?: Function;
}): Promise<string> => {
  const templateLength = inquiry
    ? summarizerTemplate.length
    : summarizerDocumentTemplate.length;

  try {
    // Increased chunk size since we're using a faster model
    const maxSize = DEFAULT_MAX_SIZE - templateLength;

    if (document.length + templateLength > maxSize) {
      console.log("Document requires summarization, length:", document.length);
      const chunks = chunkSubstr(document, maxSize);

      // Process chunks in batches
      const result = await processBatch(chunks, inquiry);

      // Only do a final pass if really needed
      if (result.length + templateLength > maxSize * 1.5) {
        console.log("Final summarization pass needed, length:", result.length);
        return await summarize({
          document: result,
          inquiry,
          onSummaryDone,
        });
      }

      return result;
    }

    return document;
  } catch (e) {
    console.log("Document summarization error:", e);
    return document.slice(0, DEFAULT_MAX_SIZE - templateLength);
  }
};

export { summarizeLongDocument };
