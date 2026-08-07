-- Create AiCredential table for per-user AI provider keys (plan §3.3).
CREATE TABLE "AiCredential" (
    "id"        TEXT NOT NULL PRIMARY KEY,
    "userId"    TEXT NOT NULL UNIQUE,
    "provider"  TEXT NOT NULL,
    "apiKey"    TEXT NOT NULL,
    "model"     TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "AiCredential_userId_key" ON "AiCredential"("userId");
