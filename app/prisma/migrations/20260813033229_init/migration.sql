-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ANALYZING', 'ACTIVE', 'PAUSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ContextSourceKind" AS ENUM ('WEBSITE', 'DOCUMENT', 'GITHUB_REPO', 'GSC', 'GA', 'USER_FEEDBACK');

-- CreateEnum
CREATE TYPE "FoundationDocKind" AS ENUM ('PRODUCT_DESCRIPTION', 'PRODUCT_INFO', 'MARKETING_STRATEGY', 'COMPETITOR_ANALYSIS', 'BRAND_VOICE');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('X', 'REDDIT', 'SEO_GEO', 'ARTICLE', 'LAUNCH', 'LINKEDIN', 'TIKTOK', 'ASO');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('CURRENT', 'DONE', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "DraftAuthor" AS ENUM ('AGENT', 'AGENT_FIX', 'HUMAN');

-- CreateEnum
CREATE TYPE "PublishMethod" AS ENUM ('API_X', 'GITHUB_PR', 'CMS', 'MANUAL');

-- CreateEnum
CREATE TYPE "AuditKind" AS ENUM ('SEO', 'GEO');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('X_OAUTH', 'GITHUB_APP', 'GSC', 'GA', 'CMS_WEBHOOK', 'SLACK_WEBHOOK', 'TELEGRAM_BOT');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('ONBOARD_ANALYSIS', 'CONTEXT_SYNC', 'DAILY_CYCLE', 'AUDIT', 'METRIC_PULL', 'WEEKLY_REVIEW');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ANALYZING',
    "languages" TEXT[] DEFAULT ARRAY['en', 'ja']::TEXT[],
    "phase" TEXT NOT NULL DEFAULT 'prelaunch',
    "cycleHours" INTEGER NOT NULL DEFAULT 6,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextSource" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "ContextSourceKind" NOT NULL,
    "config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastDigest" TEXT,
    "lastError" TEXT,
    "suggestion" JSONB,

    CONSTRAINT "ContextSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContextSnapshot" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoundationDoc" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "FoundationDocKind" NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoundationDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoundationDocRevision" (
    "id" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoundationDocRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConfig" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyQuota" INTEGER NOT NULL DEFAULT 1,
    "instructions" TEXT,
    "voiceProfile" JSONB,
    "config" JSONB,

    CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedCard" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'CURRENT',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "difficulty" "Difficulty" NOT NULL DEFAULT 'EASY',
    "language" TEXT NOT NULL DEFAULT 'en',
    "rationale" TEXT,
    "sourceRef" JSONB,
    "archiveReason" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cycleId" TEXT,

    CONSTRAINT "FeedCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "authorType" "DraftAuthor" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityReview" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "genericScore" INTEGER NOT NULL,
    "factualScore" INTEGER NOT NULL,
    "voiceScore" INTEGER NOT NULL,
    "communityScore" INTEGER,
    "passed" BOOLEAN NOT NULL,
    "critique" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalUrl" TEXT,
    "utm" TEXT,
    "method" "PublishMethod" NOT NULL,

    CONSTRAINT "PublishRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeMetric" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,

    CONSTRAINT "OutcomeMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAudit" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "AuditKind" NOT NULL,
    "score" INTEGER NOT NULL,
    "issues" JSONB NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "content" TEXT NOT NULL,
    "learnings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "label" TEXT,
    "config" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contextRefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "kind" "JobKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'RUNNING',
    "log" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");

-- CreateIndex
CREATE INDEX "ContextSnapshot_sourceId_createdAt_idx" ON "ContextSnapshot"("sourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FoundationDoc_projectId_kind_key" ON "FoundationDoc"("projectId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AgentConfig_projectId_channel_key" ON "AgentConfig"("projectId", "channel");

-- CreateIndex
CREATE INDEX "FeedCard_projectId_status_createdAt_idx" ON "FeedCard"("projectId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Draft_cardId_version_key" ON "Draft"("cardId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "QualityReview_draftId_key" ON "QualityReview"("draftId");

-- CreateIndex
CREATE UNIQUE INDEX "PublishRecord_cardId_key" ON "PublishRecord"("cardId");

-- CreateIndex
CREATE INDEX "SiteAudit_projectId_kind_createdAt_idx" ON "SiteAudit"("projectId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetricSnapshot_projectId_source_date_key" ON "MetricSnapshot"("projectId", "source", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyReview_projectId_weekStart_key" ON "WeeklyReview"("projectId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_projectId_kind_key" ON "Integration"("projectId", "kind");

-- CreateIndex
CREATE INDEX "JobRun_projectId_kind_startedAt_idx" ON "JobRun"("projectId", "kind", "startedAt");

-- AddForeignKey
ALTER TABLE "ContextSource" ADD CONSTRAINT "ContextSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContextSnapshot" ADD CONSTRAINT "ContextSnapshot_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "ContextSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoundationDoc" ADD CONSTRAINT "FoundationDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoundationDocRevision" ADD CONSTRAINT "FoundationDocRevision_docId_fkey" FOREIGN KEY ("docId") REFERENCES "FoundationDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConfig" ADD CONSTRAINT "AgentConfig_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCard" ADD CONSTRAINT "FeedCard_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedCard" ADD CONSTRAINT "FeedCard_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "FeedCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityReview" ADD CONSTRAINT "QualityReview_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "Draft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishRecord" ADD CONSTRAINT "PublishRecord_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "FeedCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeMetric" ADD CONSTRAINT "OutcomeMetric_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "PublishRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SiteAudit" ADD CONSTRAINT "SiteAudit_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyReview" ADD CONSTRAINT "WeeklyReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRun" ADD CONSTRAINT "JobRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
