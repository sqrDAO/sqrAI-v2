CREATE TABLE IF NOT EXISTS calendar_events (
    "id" UUID PRIMARY KEY,
    "agentId" UUID NOT NULL,
    "roomId" UUID,
    "userId" UUID,
    "name" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cron" TEXT,
    "scheduledAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS calendar_events_agentId ON calendar_events ("agentId");
CREATE INDEX IF NOT EXISTS calendar_events_roomId ON calendar_events ("roomId");
CREATE INDEX IF NOT EXISTS calendar_events_createdAt ON calendar_events ("createdAt");
CREATE INDEX IF NOT EXISTS calendar_events_scheduledAt ON calendar_events ("scheduledAt");
