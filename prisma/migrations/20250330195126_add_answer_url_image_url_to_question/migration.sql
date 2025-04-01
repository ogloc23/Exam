-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "answerUrl" TEXT,
ADD COLUMN     "imageUrl" TEXT,
ALTER COLUMN "answer" DROP NOT NULL;
