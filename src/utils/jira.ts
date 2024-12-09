import { supabaseAdminClient } from "./supabaseAdmin";
import { Database } from "../types/supabase";

interface CreateJiraIssueOptions {
  baseUrl: string;
  apiKey: string;
  projectKey: string;
  summary: string;
  description: string;
  issueType: string;
  priority?: string;
  assignee?: string;
  dueDate?: string;
  customFields?: Record<string, any>;
  confluenceLinks?: Array<{
    pageId: string;
    title: string;
  }>;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
}

interface JiraField {
  id: string;
  name: string;
  custom: boolean;
  schema?: {
    type: string;
    items?: string;
    custom?: string;
    customId?: number;
  };
}

interface ActionItem {
  title: string;
  description: string;
  assignee?: string;
  priority?: string;
  dueDate?: string;
}

interface ConfluencePage {
  id: string;
  title: string;
  relevance: number;
}

type AtlassianConfig = Database["public"]["Tables"]["atlassian_config"]["Row"];

export async function getJiraFields(
  baseUrl: string,
  apiKey: string
): Promise<JiraField[]> {
  const response = await fetch(`${baseUrl}/rest/api/3/field`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Jira fields: ${error}`);
  }

  return await response.json();
}

export async function createJiraIssue({
  baseUrl,
  apiKey,
  projectKey,
  summary,
  description,
  issueType,
  priority,
  assignee,
  dueDate,
  customFields = {},
  confluenceLinks = [],
}: CreateJiraIssueOptions) {
  // First, get all available fields to handle custom fields properly
  const fields = await getJiraFields(baseUrl, apiKey);

  // Create the base content
  const content: any[] = [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: description,
        },
      ],
    },
  ];

  // Add Confluence links if provided
  if (confluenceLinks.length > 0) {
    content.push({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "\nRelated Confluence Pages:",
          marks: [{ type: "strong" }],
        },
      ],
    });

    content.push({
      type: "bulletList",
      content: confluenceLinks.map((link) => ({
        type: "listItem",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "inlineCard",
                attrs: {
                  url: `${baseUrl}/wiki/spaces/viewpage.action?pageId=${link.pageId}`,
                },
              },
            ],
          },
        ],
      })),
    });
  }

  // Prepare the request body with proper field handling
  const requestBody: any = {
    fields: {
      project: {
        key: projectKey,
      },
      summary,
      description: {
        type: "doc",
        version: 1,
        content,
      },
      issuetype: {
        name: issueType,
      },
      ...(priority && { priority: { name: priority } }),
      ...(assignee && { assignee: { name: assignee } }),
      ...(dueDate && { duedate: dueDate }),
    },
  };

  // Add custom fields with proper field IDs
  for (const [key, value] of Object.entries(customFields)) {
    const field = fields.find((f) => f.name === key);
    if (field) {
      requestBody.fields[field.id] = value;
    }
  }

  const response = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Jira issue: ${error}`);
  }

  return await response.json();
}

export async function getJiraProjects(
  baseUrl: string,
  email: string,
  apiKey: string
): Promise<JiraProject[]> {
  const response = await fetch(`${baseUrl}/rest/api/3/project`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${email}:${apiKey}`).toString(
        "base64"
      )}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Jira projects: ${error}`);
  }

  const data = await response.json();
  return data.map((project: any) => ({
    id: project.id,
    key: project.key,
    name: project.name,
  }));
}

export async function getJiraIssueTypes(baseUrl: string, apiKey: string) {
  const response = await fetch(`${baseUrl}/rest/api/3/issuetype`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Jira issue types: ${error}`);
  }

  return await response.json();
}

export async function createJiraIssuesFromActionItems(
  actionItems: ActionItem[],
  userId: string,
  relatedPages?: ConfluencePage[]
) {
  try {
    // Get user's Atlassian config
    const { data: configData, error: configError } = await supabaseAdminClient
      .from("atlassian_config")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (configError || !configData) {
      throw new Error("Failed to get Atlassian configuration");
    }

    const config = configData as AtlassianConfig;

    if (!config.jira_project_key) {
      throw new Error("No Jira project key configured");
    }

    // Sort related pages by relevance if provided
    const sortedPages = relatedPages
      ? [...relatedPages].sort((a, b) => b.relevance - a.relevance)
      : [];

    // Create Jira issues for each action item
    const createdIssues = await Promise.all(
      actionItems.map(async (item) => {
        // Map priority levels
        const priorityMap: { [key: string]: string } = {
          High: "High",
          Medium: "Medium",
          Low: "Low",
        };

        // Create the issue with proper linking to Confluence pages
        return createJiraIssue({
          baseUrl: config.base_url,
          apiKey: config.api_key,
          projectKey: config.jira_project_key!,
          summary: item.title,
          description: item.description,
          issueType: "Task",
          priority: item.priority ? priorityMap[item.priority] : undefined,
          assignee: item.assignee,
          dueDate: item.dueDate,
          // Only include the most relevant pages (e.g., top 3)
          confluenceLinks: sortedPages.slice(0, 3).map((page) => ({
            pageId: page.id,
            title: page.title,
          })),
          // Allow for custom fields to be added in the future
          customFields: {},
        });
      })
    );

    return createdIssues;
  } catch (error) {
    console.error("Failed to create Jira issues:", error);
    throw error;
  }
}
