// src/resolvers/fetch.ts
import axios from 'axios';
import { PrismaClient } from '@prisma/client';
import { ApolloError } from 'apollo-server-express';

const prisma = new PrismaClient();
const BASE_API_URL = 'https://questions.aloc.com.ng/api/v2';
const ACCESS_TOKEN = 'QB-385a71b4a2ed9fd0bd27';
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = [
  '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
  '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'
];
const VALID_SUBJECTS = [
  'english language', 'mathematics', 'physics', 'chemistry', 'biology',
  'literature', 'government', 'economics', // Add more JAMB subjects as needed
];

// Mapping for API-specific subject names
const API_SUBJECT_MAP: { [key: string]: string } = {
  'english language': 'english',
  // Add more mappings if the API requires different names, e.g., 'mathematics': 'math'
};

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
  batchSize: number = 20,
  totalTarget: number = 40
): Promise<any[]> {
  const examTypeLower = examType.toLowerCase();
  if (!EXAM_TYPES.includes(examTypeLower)) throw new ApolloError('Invalid exam type', 'VALIDATION_ERROR');

  const normalizedSubject = examSubject.toLowerCase().trim();
  if (!YEARS.includes(examYear)) throw new ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');
  if (!VALID_SUBJECTS.includes(normalizedSubject)) {
    throw new ApolloError(`Invalid subject: ${examSubject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
  }

  const apiSubject = API_SUBJECT_MAP[normalizedSubject] || normalizedSubject;
  const dbSubject = normalizedSubject;

  let allQuestions: any[] = [];
  const seenIds = new Set<string>();
  const maxAttemptsPerBatch = 30;

  const fetchBatch = async (target: number): Promise<any[]> => {
    const batchQuestions: any[] = [];
    let attempts = 0;

    while (batchQuestions.length < target && attempts < maxAttemptsPerBatch) {
      try {
        const response = await apiClient.get('/q', {
          params: {
            subject: apiSubject,
            year: examYear,
            type: examTypeLower === 'jamb' ? 'utme' : examTypeLower,
          },
        });

        console.log(`API Response for ${apiSubject} ${examYear}:`, JSON.stringify(response.data, null, 2));

        const questionData = response.data.data && !Array.isArray(response.data.data)
          ? [response.data.data]
          : response.data.data || [];
        
        if (!questionData.length || !questionData[0]?.id) {
          console.warn(`No valid question data for ${apiSubject} ${examYear}: ${JSON.stringify(questionData)}`);
          attempts++;
          continue;
        }

        const question = questionData[0];
        const questionId = `${examYear}-${question.id}`;
        if (seenIds.has(questionId)) {
          console.log(`Duplicate question ID: ${questionId}`);
          attempts++;
          continue;
        }

        const options = Object.values(question.option || {})
          .filter((opt): opt is string => typeof opt === 'string' && opt !== '')
          .map(opt => opt as string);

        if (options.length < 2) {
          console.log(`Insufficient options for ${questionId}: ${options}`);
          attempts++;
          continue;
        }

        const answerIndex = ['a', 'b', 'c', 'd'].indexOf(String(question.answer ?? '').toLowerCase());
        const answerText = answerIndex !== -1 ? options[answerIndex] : question.answer || null;

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
      } catch (apiError: any) {
        console.error(`API call failed for ${apiSubject} ${examYear}: ${apiError.message}`, apiError.response?.data);
        attempts++;
      }
      attempts++;
    }

    console.log(`Batch completed: ${batchQuestions.length} questions fetched for ${apiSubject} ${examYear}`);
    return batchQuestions;
  };

  const firstBatch = await fetchBatch(batchSize);
  allQuestions = allQuestions.concat(firstBatch);

  if (allQuestions.length >= batchSize) {
    const secondBatch = await fetchBatch(batchSize);
    allQuestions = allQuestions.concat(secondBatch);
  } else {
    console.warn(`First batch only fetched ${allQuestions.length}, skipping second batch`);
  }

  if (allQuestions.length < totalTarget) {
    throw new ApolloError(`Only fetched ${allQuestions.length} questions, needed ${totalTarget}`, 'EXTERNAL_API_ERROR', {
      examType,
      examSubject: normalizedSubject,
      examYear,
      fetchedCount: allQuestions.length,
    });
  }

  console.log(`Total fetched: ${allQuestions.length} questions for ${apiSubject} ${examYear}`);
  return allQuestions.slice(0, totalTarget);
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const fetchResolvers = {
  Query: {
    fetchExternalQuestions: async (
      _: any,
      { examType, examSubject, examYear }: { examType: string; examSubject: string; examYear: string }
    ) => {
      const questions = await fetchExternalQuestions(examType, examSubject, examYear);

      await prisma.question.createMany({
        data: questions.map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
          answer: q.answer,
          examType: q.examType,
          examSubject: q.examSubject,
          examYear: q.examYear,
        })),
        skipDuplicates: true,
      });

      return questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
        answer: q.answer,
      }));
    },

    fetchStudentQuestions: async (
      _: any,
      { examType, examSubject, examYear }: { examType: string; examSubject: string; examYear: string }
    ) => {
      const dbSubject = examSubject.toLowerCase().trim();
      const questions = await prisma.question.findMany({
        where: {
          examType: examType.toLowerCase(),
          examSubject: dbSubject,
          examYear,
        },
        take: 20,
      });

      if (questions.length < 20) {
        const additionalQuestions = await fetchExternalQuestions(examType, examSubject, examYear);
        await prisma.question.createMany({
          data: additionalQuestions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
            answer: q.answer,
            examType: q.examType,
            examSubject: q.examSubject,
            examYear: q.examYear,
          })),
          skipDuplicates: true,
        });

        const updatedQuestions = await prisma.question.findMany({
          where: {
            examType: examType.toLowerCase(),
            examSubject: dbSubject,
            examYear,
          },
          take: 20,
        });

        if (updatedQuestions.length < 20) {
          throw new ApolloError(`Insufficient questions: got ${updatedQuestions.length}, need 20`, 'INSUFFICIENT_DATA');
        }

        return shuffleArray(updatedQuestions).map(q => ({
          id: q.id,
          question: q.question,
          options: q.options,
        }));
      }

      return shuffleArray(questions).map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
      }));
    },

    fetchJambSubjectQuestions: async (_: any, { sessionId }: { sessionId: number }) => {
      const session = await prisma.jambExamSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new ApolloError(`Session ${sessionId} not found`, 'NOT_FOUND');
      if (session.isCompleted) throw new ApolloError(`Session ${sessionId} is completed`, 'INVALID_STATE');

      const subjectQuestions = await Promise.all(
        session.subjects.map(async (subject) => {
          const existingQuestions = await prisma.question.findMany({
            where: {
              examType: 'jamb',
              examSubject: subject,
              examYear: session.examYear,
            },
          });

          if (existingQuestions.length < 40) {
            const externalQuestions = await fetchExternalQuestions('jamb', subject, session.examYear);
            await prisma.question.createMany({
              data: externalQuestions.map(q => ({
                id: q.id,
                question: q.question,
                options: q.options,
                answer: q.answer,
                examType: q.examType,
                examSubject: q.examSubject,
                examYear: q.examYear,
              })),
              skipDuplicates: true,
            });
          }

          const dbQuestions = await prisma.question.findMany({
            where: {
              examType: 'jamb',
              examSubject: subject,
              examYear: session.examYear,
            },
            take: 20,
          });

          if (dbQuestions.length < 20) {
            throw new ApolloError(`Not enough questions for ${subject}: got ${dbQuestions.length}`, 'INSUFFICIENT_DATA');
          }

          const shuffledQuestions = shuffleArray(dbQuestions);
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