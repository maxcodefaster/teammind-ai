"use client";

import Head from "next/head";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import * as timeago from "timeago.js";
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  ConversationHeader,
  TypingIndicator,
  VideoCallButton,
  EllipsisButton,
} from "@chatscope/chat-ui-kit-react";
import { supabaseBrowserClient } from "utils/supabaseBrowser";
import { useRouter } from "next/router";

import styles from "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";

type ConversationEntry = {
  message: string;
  speaker: "bot" | "user";
  date: Date;
  id?: string;
};

const updateChatbotMessage = (
  conversation: ConversationEntry[],
  message: { interactionId: string; token: string; event: "response" }
): ConversationEntry[] => {
  const interactionId = message.interactionId;

  const updatedConversation = conversation.reduce(
    (acc: ConversationEntry[], e: ConversationEntry) => [
      ...acc,
      e.id === interactionId ? { ...e, message: e.message + message.token } : e,
    ],
    []
  );

  return conversation.some((e) => e.id === interactionId)
    ? updatedConversation
    : [
        ...updatedConversation,
        {
          id: interactionId,
          message: message.token,
          speaker: "bot",
          date: new Date(),
        },
      ];
};

export default function Chat() {
  const [text, setText] = useState("");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [botIsTyping, setBotIsTyping] = useState(false);
  const [statusMessage, setStatusMessage] = useState("How can TeamMind help you today?");
  const [userId, setUserId] = useState<string | undefined>();
  const router = useRouter();

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/');
      } else {
        setUserId(session?.user.id);
      }
    });

    const { data: { subscription } } = supabaseBrowserClient.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        router.push('/');
      } else {
        setUserId(session?.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabaseBrowserClient.channel(userId);

    channel
      .on("broadcast", { event: "chat" }, ({ payload }) => {
        switch (payload.event) {
          case "response":
            setConversation((state) => updateChatbotMessage(state, payload));
            break;
          case "status":
            setStatusMessage(payload.message);
            break;
          case "responseEnd":
          default:
            setBotIsTyping(false);
            setStatusMessage("");
        }
      })
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const submit = async () => {
    setConversation((state) => [
      ...state,
      {
        message: text,
        speaker: "user",
        date: new Date(),
      },
    ]);
    try {
      setBotIsTyping(true);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt: text }),
      });

      await response.json();
    } catch (error) {
      console.error("Error submitting message:", error);
    }
    setText("");
  };

  if (!userId) return null;

  return (
    <>
      <Head>
        <title>TeamMind AI Chat</title>
        <meta name="description" content="Chat with TeamMind AI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className={styles.main}>
        <div
          style={{ position: "relative", height: "100vh", overflow: "hidden" }}
        >
          <MainContainer>
            <ChatContainer>
              <ConversationHeader>
                <ConversationHeader.Actions></ConversationHeader.Actions>
                <ConversationHeader.Content
                  userName="TeamMind AI"
                  info={statusMessage}
                />
                <ConversationHeader.Actions>
                    <VideoCallButton className="mr-2" />
                    <EllipsisButton orientation="vertical" />
                </ConversationHeader.Actions>
              </ConversationHeader>

              <MessageList
                typingIndicator={
                  botIsTyping ? (
                    <TypingIndicator content="AI is typing" />
                  ) : null
                }
              >
                {conversation.map((entry, index) => {
                  return (
                    <Message
                      key={index}
                      style={{ width: "90%" }}
                      model={{
                        type: "custom",
                        sender: entry.speaker,
                        position: "single",
                        direction:
                          entry.speaker === "bot" ? "incoming" : "outgoing",
                      }}
                    >
                      <Message.CustomContent>
                        <ReactMarkdown
                          remarkPlugins={[remarkMath, rehypeKatex]}
                        >
                          {entry.message}
                        </ReactMarkdown>
                      </Message.CustomContent>
                      <Message.Footer
                        sentTime={timeago.format(entry.date)}
                        sender={entry.speaker === "bot" ? "AI" : "You"}
                      />
                    </Message>
                  );
                })}
              </MessageList>
              <MessageInput
                placeholder="Type message here"
                attachButton={false}
                onSend={submit}
                onChange={(e, text) => {
                  setText(text);
                }}
                sendButton={true}
                autoFocus
              />
            </ChatContainer>
          </MainContainer>
        </div>
      </main>
    </>
  );
}
