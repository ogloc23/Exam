import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkQuestions() {
  const questions = await prisma.question.findMany({
    where: { examYear: '2006', examSubject: 'chemistry' },
  });
  console.log(`Total unique questions: ${questions.length}`);
  console.log(questions);
  await prisma.$disconnect();
}

checkQuestions().catch(console.error);