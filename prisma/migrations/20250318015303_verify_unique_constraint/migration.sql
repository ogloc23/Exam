/*
  Warnings:

  - A unique constraint covering the columns `[examYear,id]` on the table `Question` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Question_examType_examSubject_examYear_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "Question_examYear_id_key" ON "Question"("examYear", "id");
