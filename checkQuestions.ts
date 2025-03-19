import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkQuestions() {
  try {
    const subjects = ['english language', 'mathematics', 'physics', 'chemistry'];

    for (const subject of subjects) {
      const questions = await prisma.question.findMany({
        where: {
          examType: 'jamb',
          examSubject: subject,
          examYear: '2023',
        },
      });
      console.log(`Subject: ${subject}, Total questions: ${questions.length}`);
      if (questions.length > 0) {
        console.log('Raw questions:', questions);
        console.log('Mapped questions:', questions.map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
          answer: q.answer,
        })));
      } else {
        console.log(`No questions found for ${subject}`);
      }
    }

    const totalQuestions = await prisma.question.findMany({
      where: {
        examType: 'jamb',
        examYear: '2023',
      },
    });
    console.log(`Total JAMB 2023 questions (all subjects): ${totalQuestions.length}`);
    
    // Check all subjects in case of mismatch
    const allQuestions = await prisma.question.findMany({
      where: { examType: 'jamb', examYear: '2023' },
      select: { examSubject: true, id: true },
    });
    const subjectCounts = allQuestions.reduce((acc, q) => {
      acc[q.examSubject] = (acc[q.examSubject] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    console.log('Subject counts across all JAMB 2023 questions:', subjectCounts);

  } catch (error) {
    console.error('Error checking questions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkQuestions();