-- Migration: featherpanel-audit-changes
-- Adds soft-delete + fingerprint to SshKey, IP allowlist + foreign-IP notify to ApiKey,
-- isLocked to Backup, Passkey + currentChallenge for WebAuthn, and OAuth2 models.

-- AlterTable: SshKey
ALTER TABLE "SshKey" ADD COLUMN "fingerprint" TEXT;
ALTER TABLE "SshKey" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "SshKey_userId_deletedAt_idx" ON "SshKey"("userId", "deletedAt");

-- AlterTable: ApiKey
ALTER TABLE "ApiKey" ADD COLUMN "allowedIps" TEXT;
ALTER TABLE "ApiKey" ADD COLUMN "notifyForeignIp" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Backup
ALTER TABLE "Backup" ADD COLUMN "isLocked" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: Passkey
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "deviceName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN "currentChallenge" TEXT;

-- CreateTable: OAuthClient
CREATE TABLE "OAuthClient" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,
    "redirectUris" TEXT[],
    "scopes" TEXT NOT NULL DEFAULT 'read',
    "clientSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthClient_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OAuthClient_userId_idx" ON "OAuthClient"("userId");
ALTER TABLE "OAuthClient" ADD CONSTRAINT "OAuthClient_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: OAuthAuthorizationCode
CREATE TABLE "OAuthAuthorizationCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT,
    "codeChallengeMethod" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OAuthAuthorizationCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OAuthAuthorizationCode_code_key" ON "OAuthAuthorizationCode"("code");
CREATE INDEX "OAuthAuthorizationCode_clientId_idx" ON "OAuthAuthorizationCode"("clientId");
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "OAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OAuthAuthorizationCode" ADD CONSTRAINT "OAuthAuthorizationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Node
ALTER TABLE "Node" ADD COLUMN "maintenanceMode" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: SupportTicketMessage
ALTER TABLE "SupportTicketMessage" ADD COLUMN "isStaffOnly" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: TicketAttachment
CREATE TABLE "TicketAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketAttachment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TicketAttachment_messageId_idx" ON "TicketAttachment"("messageId");
ALTER TABLE "TicketAttachment" ADD CONSTRAINT "TicketAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "SupportTicketMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: NotificationPreference
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "muted" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NotificationPreference_userId_type_key" ON "NotificationPreference"("userId", "type");
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: KnowledgeBaseCategory
CREATE TABLE "KnowledgeBaseCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeBaseCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeBaseCategory_name_key" ON "KnowledgeBaseCategory"("name");
CREATE UNIQUE INDEX "KnowledgeBaseCategory_slug_key" ON "KnowledgeBaseCategory"("slug");

-- CreateTable: KnowledgeBaseArticle
CREATE TABLE "KnowledgeBaseArticle" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "helpful" INTEGER NOT NULL DEFAULT 0,
    "unhelpful" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KnowledgeBaseArticle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "KnowledgeBaseArticle_slug_key" ON "KnowledgeBaseArticle"("slug");
CREATE INDEX "KnowledgeBaseArticle_categoryId_idx" ON "KnowledgeBaseArticle"("categoryId");
ALTER TABLE "KnowledgeBaseArticle" ADD CONSTRAINT "KnowledgeBaseArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "KnowledgeBaseCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

