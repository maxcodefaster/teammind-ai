-- Add Jira project key to atlassian_config table
ALTER TABLE atlassian_config
ADD COLUMN jira_project_key text;

-- Add comment for the new column
COMMENT ON COLUMN atlassian_config.jira_project_key IS 'The key of the Jira project where issues will be created';
