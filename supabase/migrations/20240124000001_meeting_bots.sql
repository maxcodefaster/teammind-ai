-- Create meeting_bots table
CREATE TABLE meeting_bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    bot_id TEXT NOT NULL,
    bot_name TEXT NOT NULL,
    meeting_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create document_changes table
CREATE TABLE document_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_bot_id UUID REFERENCES meeting_bots(id) ON DELETE CASCADE,
    confluence_page_id TEXT NOT NULL,
    confluence_page_title TEXT NOT NULL,
    original_content TEXT,
    updated_content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', -- pending, applied, reverted
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Add RLS policies
ALTER TABLE meeting_bots ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own meeting bots"
    ON meeting_bots FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own meeting bots"
    ON meeting_bots FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own meeting bots"
    ON meeting_bots FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own document changes"
    ON document_changes FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM meeting_bots
        WHERE meeting_bots.id = document_changes.meeting_bot_id
        AND meeting_bots.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert document changes for their bots"
    ON document_changes FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM meeting_bots
        WHERE meeting_bots.id = document_changes.meeting_bot_id
        AND meeting_bots.user_id = auth.uid()
    ));

CREATE POLICY "Users can update their own document changes"
    ON document_changes FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM meeting_bots
        WHERE meeting_bots.id = document_changes.meeting_bot_id
        AND meeting_bots.user_id = auth.uid()
    ));

-- Create functions to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_meeting_bots_updated_at
    BEFORE UPDATE ON meeting_bots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_document_changes_updated_at
    BEFORE UPDATE ON document_changes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
