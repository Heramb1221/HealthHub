-- AlterTable: remember when the original login happened, so refreshing a session can
-- never extend it past an absolute maximum age. Existing sessions count from creation.
ALTER TABLE "Session" ADD COLUMN "originAt" TIMESTAMPTZ(3);
UPDATE "Session" SET "originAt" = "createdAt";
ALTER TABLE "Session" ALTER COLUMN "originAt" SET NOT NULL;
ALTER TABLE "Session" ALTER COLUMN "originAt" SET DEFAULT CURRENT_TIMESTAMP;
