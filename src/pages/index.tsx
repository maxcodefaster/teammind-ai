"use client";

import { useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabaseBrowserClient } from "utils/supabaseBrowser";
import { useRouter } from "next/router";
import Head from "next/head";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.push('/chat');
      }
    });

    const { data: { subscription } } = supabaseBrowserClient.auth.onAuthStateChange((_e, session) => {
      if (session) {
        router.push('/chat');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return (
    <>
      <Head>
        <title>TeamMind AI - Login</title>
        <meta name="description" content="Login to TeamMind AI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main style={{ 
        height: "100vh", 
        display: "flex", 
        justifyContent: "center", 
        alignItems: "center",
        padding: "20px"
      }}>
        <div style={{ width: "100%", maxWidth: "400px" }}>
          <Auth
            supabaseClient={supabaseBrowserClient}
            appearance={{ theme: ThemeSupa }}
            theme="dark"
            providers={["github"]}
          />
        </div>
      </main>
    </>
  );
}
