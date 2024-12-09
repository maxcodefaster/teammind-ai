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
  Avatar,
  Button,
} from "@chatscope/chat-ui-kit-react";
import { faVideo, faGears } from '@fortawesome/free-solid-svg-icons';
import { supabaseBrowserClient } from "utils/supabaseBrowser";
import { useRouter } from "next/router";
import MeetingBotModal from "../components/MeetingBotModal";

import styles from "@chatscope/chat-ui-kit-styles/dist/default/styles.min.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

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

const markdownStyles = {
  a: {
    color: '#2563EB',
    textDecoration: 'underline',
    '&:hover': {
      color: '#1E40AF'
    }
  },
  p: {
    lineHeight: '1',
    whiteSpace: 'pre-wrap' as const
  },
  ul: {
    marginLeft: '1.5rem',
    listStyleType: 'disc',
    listStyle: 'disc'
  },
  ol: {
    marginLeft: '1.5rem',
    listStyle: 'decimal',
  },
  li: {
  }
};

export default function Chat() {
  const [text, setText] = useState("");
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [botIsTyping, setBotIsTyping] = useState(false);
  const [statusMessage, setStatusMessage] = useState("How can TeamMind help you today?");
  const [userId, setUserId] = useState<string | undefined>();
  const [isMeetingModalOpen, setIsMeetingModalOpen] = useState(false);
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
                <Avatar
                  name="Eliot"
                  src="/teammind-ai-logo.svg"
                />
                <ConversationHeader.Content
                  userName="TeamMind AI"
                  info={statusMessage}
                />
                <ConversationHeader.Actions>
                  <Button 
                    style={{marginRight: "10px", padding: "8px"}} 
                    border 
                    labelPosition="right" 
                    icon={<FontAwesomeIcon style={{marginLeft: "10px"}} icon={faVideo} />}
                    onClick={() => setIsMeetingModalOpen(true)}
                  >
                    <span style={{marginRight: "10px"}}>New Meeting</span>
                  </Button>
                  <Button 
                    icon={<FontAwesomeIcon icon={faGears} />}
                    onClick={() => router.push('/settings')}
                  />
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
                        <div style={{ ...markdownStyles.p }}>
                          <ReactMarkdown
                            remarkPlugins={[remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              a: ({ node, ...props }) => (
                                <a style={markdownStyles.a} {...props} target="_blank" rel="noopener noreferrer" />
                              ),
                              p: ({ node, ...props }) => (
                                <p style={markdownStyles.p} {...props} />
                              ),
                              ul: ({ node, ...props }) => (
                                <ul style={markdownStyles.ul} {...props} />
                              ),
                              ol: ({ node, ...props }) => (
                                <ol style={markdownStyles.ol} {...props} />
                              ),
                              li: ({ node, ...props }) => (
                                <li style={markdownStyles.li} {...props} />
                              ),
                            }}
                          >
                            {entry.message}
                          </ReactMarkdown>
                        </div>
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
                placeholder="Type your message to TeamMind AI here..."
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

      <MeetingBotModal 
        isOpen={isMeetingModalOpen}
        onClose={() => setIsMeetingModalOpen(false)}
      />
    </>
  );
}
