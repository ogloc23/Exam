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

async function fetchExternalQuestions(
  examType: string,
  examSubject: string,
  examYear: string,
  targetCount: number = 40
): Promise<any[]> {
  const examTypeLower = examType.toLowerCase();
  if (!EXAM_TYPES.includes(examTypeLower)) {
    throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
  }
  if (!YEARS.includes(examYear)) {
    throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
  }

  const apiSubject = examSubject === 'english language' ? 'english' : examSubject;
  const dbSubject = examSubject.toLowerCase();

  let allQuestions: any[] = [];
  const seenIds = new Set<string>();
  const batchSize = 20;
  const maxAttemptsPerBatch = 10;
  const batchesNeeded = Math.ceil(targetCount / batchSize);

  for (let batch = 0; batch < batchesNeeded && allQuestions.length < targetCount; batch++) {
    const batchQuestions: any[] = [];
    let consecutiveDuplicates = 0;
    const duplicateThreshold = 5;

    for (let i = 0; i < maxAttemptsPerBatch && consecutiveDuplicates < duplicateThreshold && batchQuestions.length < batchSize && allQuestions.length < targetCount; i++) {
      try {
        const response = await apiClient.get('/q', {
          params: { 
            subject: apiSubject, 
            year: examYear, 
            type: examTypeLower === 'jamb' ? 'utme' : examTypeLower,
          },
        });

        const questionData = response.data.data && !Array.isArray(response.data.data) 
          ? [response.data.data] 
          : response.data.data || [];
        if (!questionData.length || !questionData[0]?.id || !questionData[0]?.answer) {
          console.warn(`Skipping invalid question on attempt ${i}:`, questionData);
          consecutiveDuplicates++;
          continue;
        }

        const question = questionData[0];
        const questionId = `${examYear}-${question.id}`;
        if (seenIds.has(questionId)) {
          consecutiveDuplicates++;
          continue;
        }

        const options = Object.values(question.option || {})
          .filter((opt): opt is string => typeof opt === 'string' && opt !== '')
          .map(opt => opt as string);

        if (options.length < 2) {
          consecutiveDuplicates++;
          continue;
        }

        const answerIndex = ['a', 'b', 'c', 'd'].indexOf(String(question.answer).toLowerCase());
        const answerText = answerIndex !== -1 ? options[answerIndex] : question.answer;

        const formattedQuestion = {
          id: questionId,
          question: question.question || 'No question text provided',
          options,
          answer: answerText,
          examType: examTypeLower,
          examSubject: dbSubject,
          examYear,
        };

        batchQuestions.push(formattedQuestion);
        seenIds.add(questionId);
        consecutiveDuplicates = 0;
      } catch (apiError: any) {
        console.error(`API call failed on attempt ${i}:`, apiError.message);
        consecutiveDuplicates++;
      }
    }

    allQuestions = allQuestions.concat(batchQuestions);
  }

  // Slice to exact target count
  return allQuestions.slice(0, targetCount);
}

export const fetchResolvers = {
  Query: {
    fetchExternalQuestions: async (
      _: any,
      { examType, examSubject, examYear, offset = 0 }: { examType: string; examSubject: string; examYear: string; offset?: number }
    ) => {
      const questions = await fetchExternalQuestions(examType, examSubject, examYear);
      const batchSize = 20;
      const startIndex = offset * batchSize;
      const endIndex = startIndex + batchSize;
      const result = questions.slice(startIndex, endIndex);

      if (result.length === 0) {
        throw new Error(`No more questions available at offset ${offset}`);
      }
      return result;
    },

    fetchStudentQuestions: async (
      _: any,
      { examType, examSubject, examYear }: { examType: string; examSubject: string; examYear: string }
    ) => {
      if (!EXAM_TYPES.includes(examType.toLowerCase())) {
        throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
      }
      if (!YEARS.includes(examYear)) {
        throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
      }

      const dbSubject = examSubject.toLowerCase();
      const subject = await prisma.subject.findFirst({
        where: { 
          name: examSubject,
          examType: examType.toLowerCase(),
        },
      });
      if (!subject) {
        throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
      }

      const questions = await prisma.question.findMany({
        where: {
          examType: examType.toLowerCase(),
          examSubject: dbSubject,
          examYear,
        },
        take: 20, // Limit to 20 questions
      });

      if (questions.length < 20) {
        throw new Error(`Insufficient questions in database: got ${questions.length}, need 20`);
      }

      const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
      return shuffledQuestions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
      }));
    },

    fetchJambSubjectQuestions: async (_: any, { sessionId }: { sessionId: number }) => {
      const session = await prisma.jambExamSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      if (session.isCompleted) {
        throw new Error(`Session ${sessionId} is already completed`);
      }

      const allSubjects = ['english language', 'mathematics', 'physics', 'chemistry'];
      const invalidSubjects = session.subjects.filter(sub => !allSubjects.includes(sub.toLowerCase()));
      if (invalidSubjects.length > 0) {
        throw new Error(`Session contains invalid subjects: ${invalidSubjects.join(', ')}`);
      }

      const subjectQuestions = await Promise.all(
        session.subjects.map(async (subject) => {
          // Fetch 20 questions from local database
          const localQuestions = await prisma.question.findMany({
            where: {
              examType: 'jamb',
              examSubject: subject,
              examYear: session.examYear,
            },
            take: 20, // Limit to 20 local questions
          });

          // Fetch 40 questions from external API
          const externalQuestions = await fetchExternalQuestions('jamb', subject, session.examYear, 40);

          // Combine and shuffle
          const combinedQuestions = [...localQuestions, ...externalQuestions];
          const shuffledQuestions = combinedQuestions.sort(() => 0.5 - Math.random());

          return {
            subject,
            questions: shuffledQuestions.map(q => ({
              id: q.id,
              question: q.question,
              options: q.options,
            })),
          };
        })
      );

      return subjectQuestions;
    },
  },
};