import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011', 
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', 
    '2020', '2021', '2022', '2023'];

export const submitResolvers = {
  Mutation: {
    submitAnswers: async (
      _: any,
      { examType, examSubject, examYear, questionOption }: { 
        examType: string; 
        examSubject: string; 
        examYear: string; 
        questionOption: { questionId: string; selectedAnswer: string }[] 
      }
    ) => {
      if (!EXAM_TYPES.includes(examType.toLowerCase())) {
        throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
      }
      if (!YEARS.includes(examYear)) {
        throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
      }

      try {
        const formattedSubject = `${examSubject.charAt(0).toUpperCase() + examSubject.slice(1)} (${examType.toUpperCase()})`;
        const subject = await prisma.subject.findFirst({
          where: { 
            name: formattedSubject,
            examType: examType.toLowerCase(),
          },
        });
        if (!subject) {
          throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
        }

        const questions = await prisma.question.findMany({
          where: {
            examType: examType.toLowerCase(),
            examSubject: examSubject.toLowerCase(),
            examYear,
            id: { in: questionOption.map(q => q.questionId) },
          },
        });

        if (questions.length !== questionOption.length) {
          throw new Error(`Some submitted question IDs were not found in the database`);
        }

        let score = 0;
        const detailedResults = questions.map(question => {
          const userAnswer = questionOption.find(opt => opt.questionId === question.id);
          const isCorrect = userAnswer && userAnswer.selectedAnswer === question.answer;
          if (isCorrect) score++;
          return {
            id: question.id,
            question: question.question,
            options: question.options,
            answer: question.answer,
            questionOption: {
              selectedAnswer: userAnswer?.selectedAnswer || null,
              isCorrect: isCorrect || false,
              correctAnswer: question.answer,
            },
          };
        });

        console.log(`Score calculated: ${score}/${questions.length}`);

        await prisma.score.create({
          data: {
            examType: examType.toLowerCase(),
            examSubject: examSubject.toLowerCase(),
            subjectId: subject.id,
            examYear,
            score,
          },
        });

        return {
          score,
          total: 20,
          questions: detailedResults,
        };
      } catch (error: any) {
        console.error('Error in submitAnswers:', error);
        throw new Error(error.message || 'Failed to submit answers');
      }
    },
  },
};