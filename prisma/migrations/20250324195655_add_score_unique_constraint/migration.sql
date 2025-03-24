/*
  Warnings:

  - A unique constraint covering the columns `[jambSessionId,examSubject]` on the table `Score` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Score_jambSessionId_examSubject_key" ON "Score"("jambSessionId", "examSubject");
