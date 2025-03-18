"use strict";
// import axios from 'axios';
// import { PrismaClient } from '@prisma/client';
// const prisma = new PrismaClient();
// const BASE_API_URL = 'https://questions.aloc.com.ng/api/v2';
// const ACCESS_TOKEN = 'QB-385a71b4a2ed9fd0bd27';
// const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010'];
// const EXAM_TYPES = ['jamb'];
// const apiClient = axios.create({
//   baseURL: BASE_API_URL,
//   headers: {
//     'AccessToken': ACCESS_TOKEN,
//     'Accept': 'application/json',
//   },
// });
// export const resolvers = {
//   Query: {
//     examTypes: async () => EXAM_TYPES,
//     subjects: async (_: any, { examType }: { examType: string }) => {
//       if (!EXAM_TYPES.includes(examType.toLowerCase())) {
//         throw new Error('Invalid exam type. Only "jamb" is supported.');
//       }
//       try {
//         return await prisma.subject.findMany({
//           select: { id: true, name: true },
//         });
//       } catch (error) {
//         console.error('Error fetching subjects:', error);
//         throw new Error('Failed to fetch subjects from database');
//       }
//     },
//     years: async (_: any, { examType, examSubject }: { examType: string; examSubject: string }) => {
//       if (!EXAM_TYPES.includes(examType.toLowerCase())) {
//         throw new Error('Invalid exam type. Only "jamb" is supported.');
//       }
//       try {
//         const subject = await prisma.subject.findFirst({
//           where: { name: examSubject.toLowerCase() },
//         });
//         if (!subject) {
//           throw new Error(`Subject "${examSubject}" not found`);
//         }
//         return YEARS;
//       } catch (error) {
//         console.error('Error fetching years:', error);
//         throw new Error('Failed to fetch years');
//       }
//     },
//     // Fetch questions from external API and save to database (with answers)
//     fetchExternalQuestions: async (_: any, { examType, examSubject, examYear }: { 
//       examType: string; 
//       examSubject: string; 
//       examYear: string 
//     }) => {
//       if (!EXAM_TYPES.includes(examType.toLowerCase())) {
//         throw new Error('Invalid exam type. Only "jamb" is supported.');
//       }
//       if (!YEARS.includes(examYear)) {
//         throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
//       }
//       try {
//         const subject = await prisma.subject.findFirst({
//           where: { name: examSubject.toLowerCase() },
//         });
//         if (!subject) {
//           throw new Error(`Subject "${examSubject}" not found`);
//         }
//         const existingQuestions = await prisma.question.findMany({
//           where: {
//             examType: examType.toLowerCase(),
//             examSubject: examSubject.toLowerCase(),
//             examYear,
//           },
//         });
//         const seenIds = new Set(existingQuestions.map(q => q.id));
//         const allQuestions: any[] = [...existingQuestions];
//         const totalQuestionsToReturn = 20;
//         const maxAttempts = 200;
//         let consecutiveDuplicates = 0;
//         const duplicateThreshold = 10;
//         for (let i = 0; i < maxAttempts && consecutiveDuplicates < duplicateThreshold && allQuestions.length < 40; i++) {
//           try {
//             const response = await apiClient.get('/q', {
//               params: { 
//                 subject: examSubject.toLowerCase(), 
//                 year: examYear, 
//                 type: 'utme' 
//               },
//             });
//             const questionData = response.data.data;
//             if (!questionData || !questionData.id || !questionData.answer) {
//               console.warn(`Skipping invalid question on attempt ${i}:`, questionData);
//               continue;
//             }
//             const questionId = `${examYear}-${questionData.id}`;
//             if (seenIds.has(questionId)) {
//               consecutiveDuplicates++;
//               continue;
//             }
//             const options = Object.values(questionData.option)
//               .filter((opt): opt is string => typeof opt === 'string' && opt !== null)
//               .map(opt => opt as string);
//             const question = {
//               id: questionId,
//               question: questionData.question,
//               options,
//               answer: questionData.answer,
//               examType: examType.toLowerCase(),
//               examSubject: examSubject.toLowerCase(),
//               examYear,
//             };
//             await prisma.question.upsert({
//               where: {
//                 examYear_id: {
//                   examYear,
//                   id: questionId,
//                 },
//               },
//               update: {},
//               create: question,
//             });
//             seenIds.add(questionId);
//             allQuestions.push(question);
//             consecutiveDuplicates = 0;
//           } catch (apiError: any) {
//             console.error(`API call failed on attempt ${i}:`, {
//               message: apiError.message,
//               response: apiError.response?.data,
//               status: apiError.response?.status,
//             });
//             consecutiveDuplicates++;
//             continue;
//           }
//         }
//         console.log(`Fetched ${allQuestions.length} unique questions for ${examSubject} ${examYear}`);
//         if (allQuestions.length < totalQuestionsToReturn) {
//           throw new Error(`Insufficient questions: got ${allQuestions.length}, need ${totalQuestionsToReturn}`);
//         }
//         const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
//         return shuffledQuestions.slice(0, totalQuestionsToReturn);
//       } catch (error: any) {
//         console.error('Error in fetchExternalQuestions resolver:', error);
//         throw new Error(error.message || 'Failed to fetch external questions');
//       }
//     },
//     // Fetch questions from local database for students (without answers)
//     fetchStudentQuestions: async (_: any, { examType, examSubject, examYear }: { 
//       examType: string; 
//       examSubject: string; 
//       examYear: string 
//     }) => {
//       if (!EXAM_TYPES.includes(examType.toLowerCase())) {
//         throw new Error('Invalid exam type. Only "jamb" is supported.');
//       }
//       if (!YEARS.includes(examYear)) {
//         throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
//       }
//       try {
//         const subject = await prisma.subject.findFirst({
//           where: { name: examSubject.toLowerCase() },
//         });
//         if (!subject) {
//           throw new Error(`Subject "${examSubject}" not found`);
//         }
//         const questions = await prisma.question.findMany({
//           where: {
//             examType: examType.toLowerCase(),
//             examSubject: examSubject.toLowerCase(),
//             examYear,
//           },
//         });
//         const totalQuestionsToReturn = 20;
//         if (questions.length < totalQuestionsToReturn) {
//           throw new Error(`Insufficient questions in database: got ${questions.length}, need ${totalQuestionsToReturn}`);
//         }
//         const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
//         const studentQuestions = shuffledQuestions.slice(0, totalQuestionsToReturn).map(q => ({
//           id: q.id,
//           question: q.question,
//           options: q.options,
//         }));
//         return studentQuestions;
//       } catch (error: any) {
//         console.error('Error in fetchStudentQuestions resolver:', error);
//         throw new Error(error.message || 'Failed to fetch student questions');
//       }
//     },
//   },
//   Mutation: {
//     submitAnswers: async (
//       _: any,
//       { examType, examSubject, examYear, questionOption }: { 
//         examType: string; 
//         examSubject: string; 
//         examYear: string; 
//         questionOption: { questionId: string; selectedAnswer: string }[] 
//       }
//     ) => {
//       if (!EXAM_TYPES.includes(examType.toLowerCase())) {
//         throw new Error('Invalid exam type. Only "jamb" is supported.');
//       }
//       if (!YEARS.includes(examYear)) {
//         throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
//       }
//       try {
//         const subject = await prisma.subject.findFirst({
//           where: { name: examSubject.toLowerCase() },
//         });
//         if (!subject) {
//           throw new Error(`Subject "${examSubject}" not found`);
//         }
//         const questions = await prisma.question.findMany({
//           where: {
//             examType: examType.toLowerCase(),
//             examSubject: examSubject.toLowerCase(),
//             examYear,
//             id: { in: questionOption.map(q => q.questionId) },
//           },
//         });
//         if (questions.length !== questionOption.length) {
//           throw new Error(`Some submitted question IDs were not found in the database`);
//         }
//         let score = 0;
//         const detailedResults = questions.map(question => {
//           const userAnswer = questionOption.find(opt => opt.questionId === question.id);
//           const isCorrect = userAnswer && userAnswer.selectedAnswer === question.answer;
//           if (isCorrect) score++;
//           return {
//             id: question.id,
//             question: question.question,
//             options: question.options,
//             answer: question.answer,
//             questionOption: {
//               selectedAnswer: userAnswer?.selectedAnswer || null,
//               isCorrect: isCorrect || false,
//               correctAnswer: question.answer,
//             },
//           };
//         });
//         await prisma.score.create({
//           data: {
//             examType: examType.toLowerCase(),
//             examSubject: examSubject.toLowerCase(),
//             subjectId: subject.id,
//             examYear,
//             score,
//           },
//         });
//         return {
//           score,
//           total: 20,
//           questions: detailedResults,
//         };
//       } catch (error: any) {
//         console.error('Error in submitAnswers:', error);
//         throw new Error(error.message || 'Failed to submit answers');
//       }
//     },
//   },
// };
