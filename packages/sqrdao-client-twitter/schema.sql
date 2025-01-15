create table if not exists twitter_client (
    "id" UUID primary key,
    "agentId" UUID,
    "twitterId" text,
    "twitterName" text,
    "twitterUsername" text,
    "accessToken" text,
    "refreshToken" text,
    "expiredAt" TIMESTAMPTZ
    "createdAt" TIMESTAMPTZ default CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ default CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT exists twitter_client_agentid_idx ON public.twitter_client ("agentId","twitterId");