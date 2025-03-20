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
    fetchExternalQuestions: async (
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
      const apiSubject = dbSubject === 'english language' ? 'english' : dbSubject;

      const subject = await prisma.subject.findFirst({
        where: { 
          name: examSubject,
          examType: examType.toLowerCase(),
        },
      });
      if (!subject) {
        throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
      }

      const existingQuestions = await prisma.question.findMany({
        where: {
          examType: examType.toLowerCase(),
          examSubject: dbSubject,
          examYear,
        },
      });
      const seenIds = new Set(existingQuestions.map(q => q.id));
      const allQuestions: any[] = [...existingQuestions];

      const totalQuestionsTarget = 40; // Target 40 questions in DB
      const batchSize = 20; // Fetch in batches of 20
      const maxAttemptsPerBatch = 50;

      await prisma.$transaction(async (tx) => {
        // Fetch batches until we have at least 40 questions
        while (allQuestions.length < totalQuestionsTarget) {
          let consecutiveDuplicates = 0;
          const duplicateThreshold = 10;
          let batchCount = 0;

          for (let i = 0; i < maxAttemptsPerBatch && consecutiveDuplicates < duplicateThreshold && batchCount < batchSize; i++) {
            try {
              const response = await apiClient.get('/q', {
                params: { 
                  subject: apiSubject, 
                  year: examYear, 
                  type: examType === 'jamb' ? 'utme' : examType,
                },
              });
              console.log(`API Response for ${examSubject} (attempt ${i}, batch ${Math.floor(allQuestions.length / batchSize) + 1}):`, response.data);

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
                console.log(`Duplicate found: ${questionId}`);
                consecutiveDuplicates++;
                continue;
              }

              const options = Object.values(question.option || {})
                .filter((opt): opt is string => typeof opt === 'string' && opt !== '')
                .map(opt => opt as string);

              if (options.length < 2) {
                console.warn(`Skipping ${questionId}: insufficient options (${options.length})`);
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
                examType: examType.toLowerCase(),
                examSubject: dbSubject,
                examYear,
              };

              const upsertResult = await tx.question.upsert({
                where: { examYear_id: { examYear, id: questionId } },
                update: formattedQuestion,
                create: formattedQuestion,
              });
              console.log(`Successfully upserted ${questionId}`);

              seenIds.add(questionId);
              allQuestions.push(formattedQuestion);
              consecutiveDuplicates = 0;
              batchCount++;
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

          console.log(`Batch completed. Total questions so far: ${allQuestions.length}`);

          // Break if we've hit or exceeded 40
          if (allQuestions.length >= totalQuestionsTarget) break;
        }

        // Add mocks if we still don’t have 40
        if (allQuestions.length < totalQuestionsTarget) {
          const needed = totalQuestionsTarget - allQuestions.length;
          console.log(`Adding ${needed} mock questions to reach ${totalQuestionsTarget} for ${examSubject}`);
          const mockQuestions = Array.from({ length: needed }, (_, i) => ({
            id: `${examYear}-mock-${i + 1 + allQuestions.length}`,
            question: `Mock ${examSubject} question ${i + 1 + allQuestions.length}`,
            options: ['a', 'b', 'c', 'd'],
            answer: 'a',
            examType: examType.toLowerCase(),
            examSubject: dbSubject,
            examYear,
          }));

          for (const mock of mockQuestions) {
            const mockResult = await tx.question.upsert({
              where: { examYear_id: { examYear, id: mock.id } },
              update: mock,
              create: mock,
            });
            allQuestions.push(mockResult);
          }
        }

        // Confirmation log
        console.log(`Success: Fetched and saved ${allQuestions.length} questions for ${examSubject} ${examYear} to the database`);
      }, { maxWait: 10000, timeout: 20000 });

      // Return first 20 as before
      const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
      return shuffledQuestions.slice(0, 20);
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

      const dbSubject = examSubject.toLowerCase();
      const subject = await prisma.subject.findFirst({
        where: { 
          name: `${examSubject} (${examType.toUpperCase()})`,
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
      });

      const totalQuestionsToReturn = 20;
      if (questions.length < totalQuestionsToReturn) {
        throw new Error(`Insufficient questions in database: got ${questions.length}, need ${totalQuestionsToReturn}`);
      }

      const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
      return shuffledQuestions.slice(0, totalQuestionsToReturn).map(q => ({
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
    
      const { currentSubject } = session;
      if (!currentSubject) {
        throw new Error(`No current subject set for session ${sessionId}`);
      }
    
      const examSubject = currentSubject.toLowerCase(); // No (JAMB) to replace
      const questions = await prisma.question.findMany({
        where: {
          examType: 'jamb',
          examSubject,
          examYear: session.examYear,
        },
      });
    
      const totalQuestionsToReturn = 20;
      if (questions.length < totalQuestionsToReturn) {
        throw new Error(`Insufficient questions for ${examSubject}: got ${questions.length}, need ${totalQuestionsToReturn}`);
      }
    
      const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
      return shuffledQuestions.slice(0, totalQuestionsToReturn).map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
      }));
    },
  },
};