import { ChatOpenAI } from "@langchain/openai";
import { templates } from "./templates";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import Bottleneck from "bottleneck";
import { StructuredOutputParser } from "langchain/output_parsers";
import { StringOutputParser } from "@langchain/core/output_parsers";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
});

const { summarizerTemplate, summarizerDocumentTemplate } = templates;

const parser = StructuredOutputParser.fromNamesAndDescriptions({
  answer: "answer to the user's question",
  source: "source used to answer the user's question, should be a website.",
});

const formatInstructions = parser.getFormatInstructions();

const limiter = new Bottleneck({
  minTime: 5050,
});

const chunkSubstr = (str: string, size: number) => {
  // Try to split on paragraph boundaries first
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
      // If a single paragraph is too long, split it on sentence boundaries
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
  console.log("summarizing document of length:", document.length);

  // Create prompt template based on whether there's an inquiry
  const promptTemplate = ChatPromptTemplate.fromTemplate(
    inquiry ? summarizerTemplate : summarizerDocumentTemplate
  );

  // Create the chain using LCEL with StringOutputParser
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
    // Return original document if summarization fails
    return document;
  }
};

const rateLimitedSummarize = limiter.wrap(summarize);

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
    // Increased threshold to match new context lengths
    if (document.length + templateLength > 8000) {
      console.log("Document requires summarization, length:", document.length);
      const chunks = chunkSubstr(document, 8000 - templateLength - 1);

      // Process chunks in parallel while preserving order
      const summarizedChunks = await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const result = await rateLimitedSummarize({
              document: chunk,
              inquiry,
              onSummaryDone,
            });
            return result || chunk; // Fallback to original chunk if summarization fails
          } catch (e) {
            console.log("Chunk summarization error:", e);
            return chunk; // Preserve original chunk on error
          }
        })
      );

      const result = summarizedChunks.join("\n\n");

      // Increased final summarization threshold
      if (result.length + templateLength > 10000) {
        console.log("Final summarization pass needed, length:", result.length);
        const finalResult = await rateLimitedSummarize({
          document: result,
          inquiry,
          onSummaryDone,
        });
        return finalResult || result; // Fallback to previous result if final summarization fails
      }

      return result;
    } else {
      return document; // Return original if it's not too long
    }
  } catch (e) {
    console.log("Document summarization error:", e);
    // In case of errors, return more of the original document
    return document.slice(0, 8000);
  }
};

export { summarizeLongDocument };
