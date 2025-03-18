-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[],
    "answer" TEXT NOT NULL,
    "examType" TEXT NOT NULL,
    "examSubject" TEXT NOT NULL,
    "examYear" TEXT NOT NULL,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Question_examType_examSubject_examYear_id_key" ON "Question"("examType", "examSubject", "examYear", "id");
