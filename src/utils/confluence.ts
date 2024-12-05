interface UpdatePageOptions {
  baseUrl: string;
  apiKey: string;
  pageId: string;
  title: string;
  content: string;
  version: number;
}

interface CreatePageOptions {
  baseUrl: string;
  apiKey: string;
  spaceKey: string;
  title: string;
  content: string;
}

export async function updateConfluencePage({
  baseUrl,
  apiKey,
  pageId,
  title,
  content,
  version,
}: UpdatePageOptions) {
  const response = await fetch(`${baseUrl}/wiki/api/v2/pages/${pageId}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: {
        number: version + 1,
      },
      title,
      body: {
        representation: "storage",
        value: content,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update Confluence page: ${error}`);
  }

  return await response.json();
}

export async function createConfluencePage({
  baseUrl,
  apiKey,
  spaceKey,
  title,
  content,
}: CreatePageOptions) {
  const response = await fetch(`${baseUrl}/wiki/api/v2/pages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      spaceId: spaceKey,
      status: "current",
      title,
      body: {
        representation: "storage",
        value: content,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create Confluence page: ${error}`);
  }

  return await response.json();
}

export async function getConfluencePage(
  baseUrl: string,
  apiKey: string,
  pageId: string
) {
  const response = await fetch(`${baseUrl}/wiki/api/v2/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get Confluence page: ${error}`);
  }

  return await response.json();
}

export function generateUpdatedContent(
  originalContent: string,
  meetingSummary: string,
  actionItems: Array<{
    title: string;
    description: string;
    assignee?: string;
    priority?: string;
    dueDate?: string;
  }>,
  keyPoints: string[]
) {
  // Create a section for the meeting update
  const date = new Date().toISOString().split("T")[0];
  const meetingSection = `
<ac:structured-macro ac:name="info">
  <ac:rich-text-body>
    <p><strong>Meeting Update (${date})</strong></p>
    <p>${meetingSummary}</p>
    
    ${
      keyPoints.length > 0
        ? `
    <p><strong>Key Points:</strong></p>
    <ul>
      ${keyPoints.map((point) => `<li>${point}</li>`).join("\n")}
    </ul>
    `
        : ""
    }
    
    ${
      actionItems.length > 0
        ? `
    <p><strong>Action Items:</strong></p>
    <ul>
      ${actionItems
        .map(
          (item) => `
        <li>
          <strong>${item.title}</strong>: ${item.description}
          ${item.assignee ? `<br/>Assignee: ${item.assignee}` : ""}
          ${item.priority ? `<br/>Priority: ${item.priority}` : ""}
          ${item.dueDate ? `<br/>Due Date: ${item.dueDate}` : ""}
        </li>
      `
        )
        .join("\n")}
    </ul>
    `
        : ""
    }
  </ac:rich-text-body>
</ac:structured-macro>
`;

  // If there's existing content, add the meeting section at the end
  // If not, create a new page with the meeting section
  if (originalContent && originalContent.trim()) {
    return `${originalContent}\n\n${meetingSection}`;
  } else {
    return meetingSection;
  }
}
