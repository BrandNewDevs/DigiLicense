-- CreateTable
CREATE TABLE "RateLimitWindow" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "hits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RateLimitWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateLimitWindow_bucketKey_windowStart_key" ON "RateLimitWindow"("bucketKey", "windowStart");

-- CreateIndex
CREATE INDEX "RateLimitWindow_windowStart_idx" ON "RateLimitWindow"("windowStart");
