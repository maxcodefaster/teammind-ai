import { ChatOpenAI } from "@langchain/openai";
import { templates } from "./templates";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  temperature: 0.3,
  maxConcurrency: 10, // Increased concurrency for better parallelization
});

const { summarizerTemplate, summarizerDocumentTemplate } = templates;

// Increased max size to reduce number of chunks
const DEFAULT_MAX_SIZE = 15000;
const MIN_CHUNK_SIZE = 8000; // Minimum chunk size to avoid over-fragmentation

// Optimized chunk splitting focusing on natural breakpoints
const chunkSubstr = (str: string, maxSize: number) => {
  const paragraphs = str.split("\n\n");
  const chunks: string[] = [];
  let currentChunk = "";
  let currentSize = 0;

  for (const paragraph of paragraphs) {
    const paragraphSize = paragraph.length;

    // Direct push for large paragraphs
    if (paragraphSize >= maxSize) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = "";
        currentSize = 0;
      }

      // Split large paragraphs on sentence boundaries
      const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
      let sentenceChunk = "";
      let sentenceSize = 0;

      for (const sentence of sentences) {
        const sentenceLength = sentence.length;
        if (sentenceSize + sentenceLength <= maxSize) {
          sentenceChunk += sentence;
          sentenceSize += sentenceLength;
        } else {
          if (sentenceChunk) chunks.push(sentenceChunk);
          sentenceChunk = sentence;
          sentenceSize = sentenceLength;
        }
      }

      if (sentenceChunk) chunks.push(sentenceChunk);
      continue;
    }

    // Accumulate paragraphs until reaching optimal chunk size
    if (currentSize + paragraphSize <= maxSize) {
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
      currentSize += paragraphSize + 2; // +2 for \n\n
    } else {
      // Push current chunk if it's substantial
      if (currentSize >= MIN_CHUNK_SIZE || chunks.length === 0) {
        chunks.push(currentChunk);
        currentChunk = paragraph;
        currentSize = paragraphSize;
      } else {
        // Append to last chunk if current chunk is too small
        const lastChunk = chunks.pop()!;
        chunks.push(lastChunk + "\n\n" + currentChunk);
        currentChunk = paragraph;
        currentSize = paragraphSize;
      }
    }
  }

  if (currentChunk) {
    if (currentSize < MIN_CHUNK_SIZE && chunks.length > 0) {
      // Append to last chunk if current chunk is too small
      const lastChunk = chunks.pop()!;
      chunks.push(lastChunk + "\n\n" + currentChunk);
    } else {
      chunks.push(currentChunk);
    }
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
    console.error("Summarization error:", e);
    return document;
  }
};

// Optimized batch processing with adaptive batch sizes
const processBatch = async (chunks: string[], inquiry?: string) => {
  const maxBatchSize = 5; // Process up to 5 chunks at a time
  const results: string[] = [];

  // Adaptive batch sizing based on chunk lengths
  for (let i = 0; i < chunks.length; ) {
    let batchSize = 1;
    let totalSize = chunks[i].length;

    // Determine optimal batch size based on chunk sizes
    while (
      batchSize < maxBatchSize &&
      i + batchSize < chunks.length &&
      totalSize + chunks[i + batchSize].length < DEFAULT_MAX_SIZE * 2
    ) {
      totalSize += chunks[i + batchSize].length;
      batchSize++;
    }

    const batch = chunks.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((chunk) => summarize({ document: chunk, inquiry }))
    );
    results.push(...batchResults);

    i += batchSize;
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

  const effectiveMaxSize = DEFAULT_MAX_SIZE - templateLength;

  try {
    // Skip summarization for small documents
    if (document.length <= effectiveMaxSize) {
      return document;
    }

    // Single pass for medium-sized documents
    if (document.length <= effectiveMaxSize * 2) {
      return await summarize({
        document,
        inquiry,
        onSummaryDone,
      });
    }

    // Multi-pass for large documents
    const chunks = chunkSubstr(document, effectiveMaxSize);
    const result = await processBatch(chunks, inquiry);

    // Only do final pass if really needed and result is still too large
    if (result.length > effectiveMaxSize * 1.5) {
      return await summarize({
        document: result,
        inquiry,
        onSummaryDone,
      });
    }

    return result;
  } catch (e) {
    console.error("Document summarization error:", e);
    return document.slice(0, effectiveMaxSize);
  }
};

export { summarizeLongDocument };
