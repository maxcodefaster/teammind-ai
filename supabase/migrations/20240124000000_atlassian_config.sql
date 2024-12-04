-- Create table for storing Atlassian configuration
CREATE TABLE atlassian_config (
  id uuid not null default gen_random_uuid(),
  user_id uuid references auth.users not null,
  api_key text not null,
  space_key text,
  base_url text not null,
  email text not null,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint atlassian_config_pkey primary key (id),
  constraint unique_user_config unique (user_id)
);

-- Set up Row Level Security (RLS)
alter table atlassian_config
  enable row level security;

CREATE POLICY "Allow users access to own atlassian config" ON "public"."atlassian_config"
AS PERMISSIVE FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Create function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_atlassian_config_updated_at
    BEFORE UPDATE ON atlassian_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
