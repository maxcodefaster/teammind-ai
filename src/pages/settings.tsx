import { useEffect, useState } from "react";
import { useRouter } from "next/router";

interface ConfluenceChange {
  id: string;
  title: string;
  url: string;
  lastModified: string;
  author: string;
  type: 'page' | 'blog';
}

interface JiraChange {
  id: string;
  key: string;
  summary: string;
  url: string;
  status: string;
  lastModified: string;
  assignee: string;
}

export default function Settings() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Demo data for Confluence changes
  const confluenceChanges: ConfluenceChange[] = [
    {
      id: "1",
      title: "Project Plan",
      url: "https://bytevagabond.atlassian.net/wiki/spaces/~5b8ce7326fe3122bcba47c57/pages/98467/Project+Plan",
      lastModified: "2024-12-08T10:30:00Z",
      author: "Max Heichling",
      type: 'page'
    },
    {
      id: "2",
      title: "Brainstorming Session Notes",
      url: "https://bytevagabond.atlassian.net/wiki/spaces/~5b8ce7326fe3122bcba47c57/whiteboard/98463",
      lastModified: "2024-11-28T09:15:00Z",
      author: "Lorenz Bokemeyer",
      type: 'page'
    },
    {
      id: "3",
      title: "Weekly Meeting Notes",
      url: "https://bytevagabond.atlassian.net/wiki/spaces/~5b8ce7326fe3122bcba47c57/pages/98472",
      lastModified: "2024-11-27T15:45:00Z",
      author: "Kiana Hadji Bagher",
      type: 'page'
    }
  ];

  // Demo data for Jira changes
  const jiraChanges: JiraChange[] = [
    {
      id: "1",
      key: "KAN-11",
      summary: "Implement calendar sync",
      url: "https://bytevagabond.atlassian.net/jira/software/projects/KAN/boards/1?selectedIssue=KAN-11",
      status: "In Progress",
      lastModified: "2024-12-08T11:00:00Z",
      assignee: "Max Heichling"
    },
    {
      id: "2",
      key: "TEAM-124",
      summary: "Update documentation for new features",
      url: "https://bytevagabond.atlassian.net/browse/TEAM-124",
      status: "To Do",
      lastModified: "2024-11-28T10:45:00Z",
      assignee: "Ela Su Selcuk"
    },
    {
      id: "3",
      key: "TEAM-125",
      summary: "Fix authentication bug",
      url: "https://bytevagabond.atlassian.net/browse/TEAM-125",
      status: "Done",
      lastModified: "2024-03-27T16:30:00Z",
      assignee: "Efe Mistik"
    }
  ];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Recent Updates</h1>
          <button
            onClick={() => router.push("/chat")}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Back to Chat
          </button>
        </div>

        {/* Confluence Changes */}
        <div className="bg-white shadow rounded-lg overflow-hidden mb-8">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Confluence Changes</h2>
            <div className="space-y-4">
              {confluenceChanges.map((change) => (
                <div
                  key={change.id}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <a 
                        href={change.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {change.title}
                      </a>
                      <p className="text-sm text-gray-500">
                        Modified by {change.author} on {formatDate(change.lastModified)}
                      </p>
                    </div>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {change.type}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Jira Changes */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">Recent Jira Updates</h2>
            <div className="space-y-4">
              {jiraChanges.map((change) => (
                <div
                  key={change.id}
                  className="bg-gray-50 rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono text-gray-600">{change.key}</span>
                        <a 
                          href={change.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {change.summary}
                        </a>
                      </div>
                      <p className="text-sm text-gray-500">
                        Assigned to {change.assignee} • Last updated {formatDate(change.lastModified)}
                      </p>
                    </div>
                    <span 
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        change.status === 'Done' 
                          ? 'bg-green-100 text-green-800'
                          : change.status === 'In Progress'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {change.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
