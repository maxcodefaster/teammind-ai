import { useEffect, useState } from "react";
import { supabaseBrowserClient } from "../utils/supabaseBrowser";
import { useRouter } from "next/router";

interface DocumentChange {
  id: string;
  meeting_bot_id: string;
  confluence_page_id: string;
  confluence_page_title: string;
  original_content: string | null;
  updated_content: string;
  status: string;
  created_at: string;
}

interface MeetingBot {
  id: string;
  bot_name: string;
  meeting_url: string;
  status: string;
  created_at: string;
}

export default function Settings() {
  const router = useRouter();
  const [changes, setChanges] = useState<DocumentChange[]>([]);
  const [bots, setBots] = useState<MeetingBot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError("");

      // Fetch meeting bots
      const { data: botsData, error: botsError } = await supabaseBrowserClient
        .from("meeting_bots")
        .select("*")
        .order("created_at", { ascending: false });

      if (botsError) throw botsError;

      // Fetch document changes
      const { data: changesData, error: changesError } = await supabaseBrowserClient
        .from("document_changes")
        .select("*")
        .order("created_at", { ascending: false });

      if (changesError) throw changesError;

      setBots(botsData);
      setChanges(changesData);
    } catch (err) {
      setError("Failed to load data. Please try again.");
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRevert = async (changeId: string) => {
    try {
      const change = changes.find((c) => c.id === changeId);
      if (!change) return;

      // TODO: Implement revert functionality with Confluence API
      const { error: updateError } = await supabaseBrowserClient
        .from("document_changes")
        .update({ status: "reverted" })
        .eq("id", changeId);

      if (updateError) throw updateError;

      // Refresh data
      await fetchData();
    } catch (err) {
      setError("Failed to revert change. Please try again.");
      console.error("Error reverting change:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="animate-pulse flex space-x-4">
            <div className="flex-1 space-y-4 py-1">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="space-y-3">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Meeting Bot Settings</h1>
          <button
            onClick={() => router.push("/chat")}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Back to Chat
          </button>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Changes</h2>
            
            <div className="space-y-6">
              {changes.map((change) => {
                const bot = bots.find((b) => b.id === change.meeting_bot_id);
                return (
                  <div
                    key={change.id}
                    className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">
                          {change.confluence_page_title}
                        </h3>
                        <p className="text-sm text-gray-500">
                          From meeting: {bot?.bot_name || "Unknown"}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${
                          change.status === "pending"
                            ? "bg-yellow-100 text-yellow-800"
                            : change.status === "applied"
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {change.status}
                      </span>
                    </div>

                    <div className="mt-4 space-y-4">
                      {change.original_content && (
                        <div>
                          <h4 className="text-xs font-medium text-gray-500 mb-1">
                            Original Content
                          </h4>
                          <div className="text-sm text-gray-700 bg-white p-3 rounded border border-gray-200">
                            {change.original_content}
                          </div>
                        </div>
                      )}

                      <div>
                        <h4 className="text-xs font-medium text-gray-500 mb-1">
                          Updated Content
                        </h4>
                        <div className="text-sm text-gray-700 bg-white p-3 rounded border border-gray-200">
                          {change.updated_content}
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => handleRevert(change.id)}
                          disabled={change.status === "reverted"}
                          className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Revert Change
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

              {changes.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">
                    No changes have been made yet.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
