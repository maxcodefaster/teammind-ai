import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseBrowserClient } from 'utils/supabaseBrowser';
import Head from 'next/head';

export default function Connect() {
  const [apiKey, setApiKey] = useState('');
  const [email, setEmail] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [spaces, setSpaces] = useState<Array<{ key: string; name: string }>>([]);
  const [selectedSpace, setSelectedSpace] = useState('');
  const [jiraProjects, setJiraProjects] = useState<Array<{ key: string; name: string }>>([]);
  const [selectedJiraProject, setSelectedJiraProject] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isVectorizing, setIsVectorizing] = useState(false);
  const router = useRouter();

  useEffect(() => {
    supabaseBrowserClient.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/');
      }
    });

    const { data: { subscription } } = supabaseBrowserClient.auth.onAuthStateChange((_e, session) => {
      if (!session) {
        router.push('/');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  // Set email and baseUrl from OAuth callback (stored but not displayed)
  useEffect(() => {
    if (router.query.email && router.query.baseUrl) {
      setEmail(decodeURIComponent(router.query.email as string));
      setBaseUrl(decodeURIComponent(router.query.baseUrl as string));
    }
  }, [router.query]);

  const startOAuth = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/atlassian/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to start OAuth flow');
      }
      
      const data = await response.json();
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start OAuth flow');
      setIsLoading(false);
    }
  };

  const validateApiKey = async () => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/atlassian/validate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ apiKey, email, baseUrl }),
      });
      
      if (!response.ok) {
        throw new Error('Invalid API key');
      }
      
      const data = await response.json();
      setSpaces(data.spaces);
      setJiraProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate API key');
    } finally {
      setIsLoading(false);
    }
  };

  const startVectorization = async () => {
    if (!selectedSpace || !selectedJiraProject) return;
    
    setIsVectorizing(true);
    try {
      // Save Jira project key to atlassian_config
      const { data: session } = await supabaseBrowserClient.auth.getSession();
      if (!session.session) throw new Error('No session found');

      const { error: configError } = await supabaseBrowserClient
        .from('atlassian_config')
        .update({ 
          jira_project_key: selectedJiraProject 
        })
        .eq('user_id', session.session.user.id);

      if (configError) throw configError;

      const response = await fetch('/api/atlassian/vectorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey,
          baseUrl,
          spaceKey: selectedSpace,
          email,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to vectorize content');
      }

      router.push('/chat');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to vectorize content');
      setIsVectorizing(false);
    }
  };

  const renderStep = () => {
    // Step 1: OAuth
    if (!email || !baseUrl) {
      return (
        <div className="space-y-6">
          <div className="rounded-md bg-blue-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  Connect with Atlassian
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  Click the button below to connect your Atlassian account. This will help us:
                  <ul className="list-disc pl-4 mt-2">
                    <li>Verify your Confluence workspace</li>
                    <li>Set up the connection securely</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={startOAuth}
              disabled={isLoading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Connecting...' : 'Connect with Atlassian'}
            </button>
          </div>
        </div>
      );
    }

    // Step 2: API Key
    if (!spaces.length) {
      return (
        <div className="space-y-6">
          <div className="rounded-md bg-blue-50 p-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">
                  How to get your API key:
                </h3>
                <div className="mt-2 text-sm text-blue-700">
                  <ol className="list-decimal pl-4">
                    <li>Go to your Atlassian account settings</li>
                    <li>Navigate to Security &gt; API tokens</li>
                    <li>Click <u><a target='_blank' rel='noreferrer' href='https://id.atlassian.com/manage-profile/security/api-tokens'>here</a></u> to go directly</li>
                    <li>Give it a name and copy the generated token</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700">
              API Key
            </label>
            <div className="mt-1">
              <input
                type="password"
                id="apiKey"
                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
              />
            </div>
          </div>

          <div>
            <button
              onClick={validateApiKey}
              disabled={isLoading || !apiKey}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Validating...' : 'Validate & Continue'}
            </button>
          </div>
        </div>
      );
    }

    // Step 3: Space and Project Selection
    return (
      <div className="space-y-6">
        <div>
          <label htmlFor="space" className="block text-sm font-medium text-gray-700">
            Select Confluence Space
          </label>
          <select
            id="space"
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            value={selectedSpace}
            onChange={(e) => setSelectedSpace(e.target.value)}
          >
            <option value="">Select a space</option>
            {spaces.map((space) => (
              <option key={space.key} value={space.key}>
                {space.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="jiraProject" className="block text-sm font-medium text-gray-700">
            Select Jira Project
          </label>
          <select
            id="jiraProject"
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            value={selectedJiraProject}
            onChange={(e) => setSelectedJiraProject(e.target.value)}
          >
            <option value="">Select a project</option>
            {jiraProjects.map((project) => (
              <option key={project.key} value={project.key}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <button
            onClick={startVectorization}
            disabled={isVectorizing || !selectedSpace || !selectedJiraProject}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {isVectorizing ? (
              <div className="flex items-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Vectorizing Content...
              </div>
            ) : (
              'Start Processing'
            )}
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <Head>
        <title>Connect Atlassian - TeamMind AI</title>
        <meta name="description" content="Connect your Atlassian workspace to TeamMind AI" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Connect to Atlassian
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Follow these steps to connect your Atlassian workspace
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
            {renderStep()}

            {error && (
              <div className="mt-4 rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Error
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
