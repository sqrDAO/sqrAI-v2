
-- Create a function to determine vector dimension
-- CREATE OR REPLACE FUNCTION get_embedding_dimension()
-- RETURNS INTEGER AS $$
-- BEGIN
--     -- Check for OpenAI first
--     IF current_setting('app.use_openai_embedding', TRUE) = 'true' THEN
--         RETURN 1536;  -- OpenAI dimension
--     -- Then check for Ollama
--     ELSIF current_setting('app.use_ollama_embedding', TRUE) = 'true' THEN
--         RETURN 1024;  -- Ollama mxbai-embed-large dimension
--     ELSE
--         RETURN 384;   -- BGE/Other embedding dimension
--     END IF;
-- END;
-- $$ LANGUAGE plpgsql;

BEGIN;

CREATE TABLE IF NOT EXISTS repositories (
    "id" UUID PRIMARY KEY,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "localPath" TEXT,
    "owner" TEXT,
    "description" TEXT
);
CREATE TABLE IF NOT EXISTS code_files (
    "id" UUID PRIMARY KEY,
    "repositoryId" UUID NOT NULL REFERENCES repositories("id"),
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "relativePath" TEXT,
    "embedding" vector(384),
    "contentHash" TEXT
);

CREATE INDEX IF NOT EXISTS idx_repositories_name on repositories("name");
CREATE INDEX IF NOT EXISTS idx_repositories_owner on repositories("owner");

CREATE INDEX IF NOT EXISTS idx_code_files_repositoriesId ON code_files("repositoryId");
CREATE INDEX IF NOT EXISTS idx_code_files_name ON code_files("name");
CREATE INDEX IF NOT EXISTS idx_code_files_content_hash ON code_files("contentHash");
CREATE INDEX IF NOT EXISTS idx_code_files_embedding ON code_files USING hnsw ("embedding" vector_cosine_ops);

COMMIT;