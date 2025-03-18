import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_API_URL = 'https://questions.aloc.com.ng/api/v2';
const ACCESS_TOKEN = 'QB-385a71b4a2ed9fd0bd27';
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011', 
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', 
    '2020', '2021', '2022', '2023'];

const apiClient = axios.create({
  baseURL: BASE_API_URL,
  headers: {
    'AccessToken': ACCESS_TOKEN,
    'Accept': 'application/json',
  },
});

export const fetchResolvers = {
  Query: {
    fetchExternalQuestions: async (_: any, { examType, examSubject, examYear }: { 
      examType: string; 
      examSubject: string; 
      examYear: string 
    }) => {
      if (!EXAM_TYPES.includes(examType.toLowerCase())) {
        throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
      }
      if (!YEARS.includes(examYear)) {
        throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
      }

      try {
        const subject = await prisma.subject.findFirst({
          where: { 
            name: `${examSubject} (${examType.toUpperCase()})`, // Match seeded name
            examType: examType.toLowerCase(),
          },
        });
        if (!subject) {
          throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
        }

        const existingQuestions = await prisma.question.findMany({
          where: {
            examType: examType.toLowerCase(),
            examSubject: examSubject.toLowerCase(), // Keep lowercase for DB consistency
            examYear,
          },
        });
        const seenIds = new Set(existingQuestions.map(q => q.id));
        const allQuestions: any[] = [...existingQuestions];

        const totalQuestionsToReturn = 20;
        const maxAttempts = 200;
        let consecutiveDuplicates = 0;
        const duplicateThreshold = 10;

        for (let i = 0; i < maxAttempts && consecutiveDuplicates < duplicateThreshold && allQuestions.length < 40; i++) {
          try {
            const response = await apiClient.get('/q', {
              params: { 
                subject: examSubject.toLowerCase(), 
                year: examYear, 
                type: examType === 'jamb' ? 'utme' : examType, // Adjust API type based on examType
              },
            });
            const questionData = response.data.data;
            if (!questionData || !questionData.id || !questionData.answer) {
              console.warn(`Skipping invalid question on attempt ${i}:`, questionData);
              continue;
            }

            const questionId = `${examYear}-${questionData.id}`;
            if (seenIds.has(questionId)) {
              consecutiveDuplicates++;
              continue;
            }

            const options = Object.values(questionData.option)
              .filter((opt): opt is string => typeof opt === 'string' && opt !== null)
              .map(opt => opt as string);

            const question = {
              id: questionId,
              question: questionData.question,
              options,
              answer: questionData.answer,
              examType: examType.toLowerCase(),
              examSubject: examSubject.toLowerCase(),
              examYear,
            };

            await prisma.question.upsert({
              where: {
                examYear_id: {
                  examYear,
                  id: questionId,
                },
              },
              update: {},
              create: question,
            });

            seenIds.add(questionId);
            allQuestions.push(question);
            consecutiveDuplicates = 0;
          } catch (apiError: any) {
            console.error(`API call failed on attempt ${i}:`, {
              message: apiError.message,
              response: apiError.response?.data,
              status: apiError.response?.status,
            });
            consecutiveDuplicates++;
            continue;
          }
        }

        console.log(`Fetched ${allQuestions.length} unique questions for ${examSubject} ${examYear}`);

        if (allQuestions.length < totalQuestionsToReturn) {
          throw new Error(`Insufficient questions: got ${allQuestions.length}, need ${totalQuestionsToReturn}`);
        }

        const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
        return shuffledQuestions.slice(0, totalQuestionsToReturn);
      } catch (error: any) {
        console.error('Error in fetchExternalQuestions resolver:', error);
        throw new Error(error.message || 'Failed to fetch external questions');
      }
    },

    fetchStudentQuestions: async (_: any, { examType, examSubject, examYear }: { 
      examType: string; 
      examSubject: string; 
      examYear: string 
    }) => {
      if (!EXAM_TYPES.includes(examType.toLowerCase())) {
        throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
      }
      if (!YEARS.includes(examYear)) {
        throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
      }

      try {
        const subject = await prisma.subject.findFirst({
          where: { 
            name: `${examSubject} (${examType.toUpperCase()})`, // Match seeded name
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
          },
        });

        const totalQuestionsToReturn = 20;

        if (questions.length < totalQuestionsToReturn) {
          throw new Error(`Insufficient questions in database: got ${questions.length}, need ${totalQuestionsToReturn}`);
        }

        const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
        const studentQuestions = shuffledQuestions.slice(0, totalQuestionsToReturn).map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
        }));

        return studentQuestions;
      } catch (error: any) {
        console.error('Error in fetchStudentQuestions resolver:', error);
        throw new Error(error.message || 'Failed to fetch student questions');
      }
    },
  },
};