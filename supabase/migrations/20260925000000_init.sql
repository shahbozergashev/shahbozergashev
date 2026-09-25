-- Knowledge base for the Ask Shaha clone.
create extension if not exists vector;

create table if not exists documents (
  id          bigserial primary key,
  content     text not null,
  embedding   vector(768),
  source_type text not null check (source_type in (
    'bio', 'article', 'interview', 'linkedin_post',
    'telegram_post', 'youtube_transcript', 'book'
  )),
  source_url   text,
  source_title text,
  language     text not null default 'uz' check (language in ('uz', 'ru', 'en')),
  -- Stable key (file path + chunk index) so re-ingesting a file replaces its rows.
  chunk_key    text unique not null,
  published_at timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists documents_embedding_idx
  on documents using hnsw (embedding vector_cosine_ops);

create index if not exists documents_content_fts_idx
  on documents using gin (to_tsvector('simple', content));

-- Only the server (service role) touches this table; nothing is exposed to the browser.
alter table documents enable row level security;

create or replace function match_documents(
  query_embedding vector(768),
  match_threshold float default 0.5,
  match_count int default 8
)
returns table (
  id bigint,
  content text,
  source_type text,
  source_url text,
  source_title text,
  published_at timestamptz,
  similarity float
)
language sql stable
as $$
  select d.id, d.content, d.source_type, d.source_url, d.source_title, d.published_at,
         1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where d.embedding is not null
    and 1 - (d.embedding <=> query_embedding) > match_threshold
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- Keyword fallback for names, brands and exact phrases the embeddings can miss.
create or replace function keyword_documents(query text, match_count int default 4)
returns table (
  id bigint,
  content text,
  source_type text,
  source_url text,
  source_title text,
  published_at timestamptz,
  similarity float
)
language sql stable
as $$
  select d.id, d.content, d.source_type, d.source_url, d.source_title, d.published_at,
         ts_rank(to_tsvector('simple', d.content), websearch_to_tsquery('simple', query))::float as similarity
  from documents d
  where to_tsvector('simple', d.content) @@ websearch_to_tsquery('simple', query)
  order by similarity desc
  limit match_count;
$$;
