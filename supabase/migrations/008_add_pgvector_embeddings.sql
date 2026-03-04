-- pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Embedding table
CREATE TABLE sns_post_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES sns_posts(id) ON DELETE CASCADE,
  org_id uuid REFERENCES sns_organizations(id),
  platform text NOT NULL,
  embedding vector(1536),
  engagement_score float DEFAULT 0,
  is_winning boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- IVFFlat index for approximate nearest neighbor search
CREATE INDEX idx_post_embeddings_vector ON sns_post_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

CREATE INDEX idx_post_embeddings_org ON sns_post_embeddings(org_id);
CREATE INDEX idx_post_embeddings_platform ON sns_post_embeddings(platform);
CREATE INDEX idx_post_embeddings_winning ON sns_post_embeddings(is_winning) WHERE is_winning = true;

-- Row Level Security
ALTER TABLE sns_post_embeddings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_members_can_view_embeddings" ON sns_post_embeddings
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM sns_org_members WHERE user_id = auth.uid())
  );

-- Similarity search function: find winning posts closest to a query embedding
CREATE OR REPLACE FUNCTION match_winning_posts(
  query_embedding vector(1536),
  match_org_id uuid,
  match_platform text DEFAULT NULL,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  post_id uuid,
  platform text,
  engagement_score float,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.post_id,
    e.platform,
    e.engagement_score,
    1 - (e.embedding <=> query_embedding) as similarity
  FROM sns_post_embeddings e
  WHERE e.org_id = match_org_id
    AND e.is_winning = true
    AND (match_platform IS NULL OR e.platform = match_platform)
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
