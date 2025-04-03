// src/graphql/resolvers/jamb.ts
import { PrismaClient } from '@prisma/client';
import { hash, compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ApolloError } from 'apollo-server-express';
import { fetchExternalQuestions, fetchMyschoolQuestions, ExamType, ExamYear, ExamSubject, Question } from './fetch'; // Adjust path as needed

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});
const JAMB_TIME_LIMIT = 5400 * 1000; // 90 minutes in milliseconds

const YEARS = [
  '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016',
  '2015', '2014', '2013', '2012', '2011', '2010', '2009', '2008', '2007', '2006', '2005'
] as const;
type YearType = typeof YEARS[number];

interface Context {
  token?: string;
}

const authMiddleware = (context: Context) => {
  const token = context.token;
  if (!token) throw new ApolloError('No token provided', 'UNAUTHENTICATED');
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { id: number };
    return decoded.id;
  } catch (error) {
    throw new ApolloError('Invalid or expired token', 'UNAUTHENTICATED');
  }
};

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function normalizeSubject(subject: string): ExamSubject {
  return subject.trim().toLowerCase().replace(/\s+/g, '-') as ExamSubject;
}

function formatSubjectForFrontend(subject: string): string {
  const parts = subject.split('-');
  return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

export const jambResolvers = {
  Query: {
    years: () => YEARS,

    subjects: async () => {
      const subjects = await prisma.subject.findMany({
        where: { examType: 'jamb' },
      });
      return subjects.map(subject => ({
        id: subject.id,
        name: formatSubjectForFrontend(subject.name),
      }));
    },

    fetchJambSubjectQuestions: async (_: any, { sessionId }: { sessionId: number }, context: Context) => {
      const studentId = authMiddleware(context);
      const session = await prisma.jambExamSession.findUnique({
        where: { id: sessionId },
        select: { id: true, studentId: true, subjects: true, examYear: true, isCompleted: true }
      });
      if (!session) throw new ApolloError('Session not found', 'NOT_FOUND');
      if (session.studentId !== studentId) throw new ApolloError('Unauthorized access to session', 'FORBIDDEN');
      if (session.isCompleted) throw new ApolloError('Session already completed', 'INVALID_STATE');

      console.log(`Processing session ${sessionId} with subjects: ${session.subjects}, year: ${session.examYear}`);

      if (!YEARS.includes(session.examYear as any)) {
        throw new ApolloError(`Invalid exam year: ${session.examYear}. Must be one of: ${YEARS.join(', ')}`, 'VALIDATION_ERROR');
      }
      const examYear: ExamYear = session.examYear as ExamYear;

      if (session.subjects.length !== 4) {
        throw new ApolloError(`Exactly 4 subjects required, got ${session.subjects.length}`, 'VALIDATION_ERROR');
      }

      const VALID_SUBJECTS: ExamSubject[] = [
        'mathematics', 'english-language', 'fine-arts', 'music', 'french', 'animal-husbandry', 'insurance', 'chemistry',
        'physics', 'yoruba', 'biology', 'geography', 'literature-in-english', 'economics', 'commerce',
        'accounts-principles-of-accounts', 'government', 'igbo', 'christian-religious-knowledge', 'agricultural-science',
        'islamic-religious-knowledge', 'history', 'civic-education', 'further-mathematics', 'arabic', 'home-economics',
        'hausa', 'book-keeping', 'data-processing', 'catering-craft-practice', 'computer-studies', 'marketing',
        'physical-education', 'office-practice', 'technical-drawing', 'food-and-nutrition', 'home-management'
      ];

      const subjectQuestions = await Promise.all(
        session.subjects.map(async (subject) => {
          const normalizedSubject = normalizeSubject(subject);
          if (!VALID_SUBJECTS.includes(normalizedSubject)) {
            throw new ApolloError(`Invalid subject: ${subject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
          }
          console.log(`Processing subject: ${normalizedSubject}`);

          const targetQuestions = normalizedSubject === 'english-language' ? 60 : 40;

          // Step 1: Fetch questions for the specific year first
          let validQuestions = await prisma.question.findMany({
            where: {
              examType: 'jamb',
              examSubject: normalizedSubject,
              examYear,
              answer: { not: null },
            },
            take: targetQuestions,
          }).then(questions => questions.filter(q => {
            const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
            const requiresImage = q.question.toLowerCase().includes('diagram') ||
              q.question.toLowerCase().includes('figure') ||
              q.question.toLowerCase().includes('image');
            const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
            return hasValidOptions && hasImageIfRequired;
          }));
          console.log(`Valid questions for ${normalizedSubject} in ${examYear}: ${validQuestions.length}`);

          // Step 2: Quickly fill gaps with other years if needed
          if (validQuestions.length < targetQuestions) {
            console.log(`Insufficient questions (${validQuestions.length}/${targetQuestions}) for ${examYear}, fetching from other years...`);
            const remainingNeeded = targetQuestions - validQuestions.length;
            const otherYearsQuestions = await prisma.question.findMany({
              where: {
                examType: 'jamb',
                examSubject: normalizedSubject,
                examYear: { not: examYear },
              },
              take: remainingNeeded,
            }).then(questions => questions.filter(q => {
              const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
              const requiresImage = q.question.toLowerCase().includes('diagram') ||
                q.question.toLowerCase().includes('figure') ||
                q.question.toLowerCase().includes('image');
              const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
              return hasValidOptions && hasImageIfRequired;
            }));
            validQuestions = [
              ...validQuestions,
              ...otherYearsQuestions.filter(q => !validQuestions.some(vq => vq.id === q.id)),
            ].slice(0, targetQuestions);
            console.log(`After adding from other years: ${validQuestions.length}`);
          }

          // Step 3: Fetch from Myschool.ng only if still insufficient
          if (validQuestions.length < targetQuestions) {
            console.log(`Still insufficient (${validQuestions.length}/${targetQuestions}), fetching from Myschool.ng...`);
            try {
              const fetchedQuestions = await fetchMyschoolQuestions(
                'jamb' as ExamType,
                normalizedSubject,
                examYear
              );
              const neededQuestions = fetchedQuestions.slice(0, targetQuestions - validQuestions.length);
              console.log(`Fetched ${neededQuestions.length} questions from Myschool.ng for ${normalizedSubject}`);

              await prisma.question.createMany({
                data: neededQuestions,
                skipDuplicates: true,
              });

              const newQuestions = await prisma.question.findMany({
                where: {
                  examType: 'jamb',
                  examSubject: normalizedSubject,
                  examYear,
                },
                take: targetQuestions - validQuestions.length,
              }).then(questions => questions.filter(q => {
                const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                const requiresImage = q.question.toLowerCase().includes('diagram') ||
                  q.question.toLowerCase().includes('figure') ||
                  q.question.toLowerCase().includes('image');
                const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                return hasValidOptions && hasImageIfRequired;
              }));
              validQuestions = [
                ...validQuestions,
                ...newQuestions.filter(q => !validQuestions.some(vq => vq.id === q.id)),
              ].slice(0, targetQuestions);
              console.log(`After Myschool fetch: ${validQuestions.length}`);
            } catch (myschoolError: any) {
              console.error(`Myschool fetch failed for ${normalizedSubject}: ${myschoolError.message}`);
            }
          }

          // Step 4: Finalize with exact count
          const finalQuestions = shuffleArray(validQuestions).slice(0, targetQuestions);
          if (finalQuestions.length < targetQuestions) {
            console.warn(`Warning: Only ${finalQuestions.length}/${targetQuestions} questions available for ${normalizedSubject}`);
          }
          console.log(`Final questions for ${normalizedSubject}: ${finalQuestions.length}`);

          return {
            subject: formatSubjectForFrontend(normalizedSubject),
            questions: finalQuestions.map(q => ({
              id: q.id,
              question: q.question,
              options: q.options,
              answer: q.answer ?? undefined,
              imageUrl: q.imageUrl ?? undefined,
            })),
          };
        })
      );

      console.log(`Total questions selected for session: ${subjectQuestions.reduce((sum, sq) => sum + sq.questions.length, 0)}`);
      return subjectQuestions;
    },

    fetchJambCompetitionQuestions: async (_: any, { sessionId }: { sessionId: number }, context: Context) => {
      const studentId = authMiddleware(context);
      const session = await prisma.jambExamSession.findUnique({
        where: { id: sessionId },
        select: { id: true, studentId: true, subjects: true, examYear: true, isCompleted: true }
      });
      if (!session) throw new ApolloError('Session not found', 'NOT_FOUND');
      if (session.studentId !== studentId) throw new ApolloError('Unauthorized access to session', 'FORBIDDEN');
      if (session.isCompleted) throw new ApolloError('Session already completed', 'INVALID_STATE');

      console.log(`Processing session ${sessionId} with subjects: ${session.subjects}, year: ${session.examYear}`);

      if (!YEARS.includes(session.examYear as any)) {
        throw new ApolloError(`Invalid exam year: ${session.examYear}. Must be one of: ${YEARS.join(', ')}`, 'VALIDATION_ERROR');
      }


      const examYear: ExamYear = session.examYear as ExamYear;

      if (session.subjects.length !== 4) {
        throw new ApolloError(`Exactly 4 subjects required, got ${session.subjects.length}`, 'VALIDATION_ERROR');
      }

      const VALID_SUBJECTS: ExamSubject[] = [
        'mathematics', 'english-language', 'fine-arts', 'music', 'french', 'animal-husbandry', 'insurance', 'chemistry',
        'physics', 'yoruba', 'biology', 'geography', 'literature-in-english', 'economics', 'commerce',
        'accounts-principles-of-accounts', 'government', 'igbo', 'christian-religious-knowledge', 'agricultural-science',
        'islamic-religious-knowledge', 'history', 'civic-education', 'further-mathematics', 'arabic', 'home-economics',
        'hausa', 'book-keeping', 'data-processing', 'catering-craft-practice', 'computer-studies', 'marketing',
        'physical-education', 'office-practice', 'technical-drawing', 'food-and-nutrition', 'home-management'
      ];

      // Define the Question type
      type Question = {
        id: string;
        examType: string;
        examYear: string;
        options: string[];
        question: string;
        imageUrl: string | null;
        answer: string | null;
        examSubject: string;
        answerUrl: string | null;
      };

      const subjectQuestions = await Promise.all(
        session.subjects.map(async (subject) => {
          const normalizedSubject = normalizeSubject(subject);
          if (!VALID_SUBJECTS.includes(normalizedSubject)) {
            throw new ApolloError(`Invalid subject: ${subject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
          }
          console.log(`Processing subject: ${normalizedSubject}`);

          const targetQuestions = normalizedSubject === 'english-language' ? 60 : 40;

          // Step 1: Fetch random questions using raw SQL
          const rawQuestions = await prisma.$queryRaw`
              SELECT * FROM "Question" 
              WHERE "examType" = 'jamb' 
              AND "examSubject" = ${normalizedSubject}
              AND "answer" IS NOT NULL
              ORDER BY RANDOM() 
              LIMIT ${targetQuestions};
            `;

          // Cast and validate the raw query results
          let validQuestions = (rawQuestions as Question[]).filter(q => {
            const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
            const requiresImage = q.question.toLowerCase().includes('diagram') ||
              q.question.toLowerCase().includes('figure') ||
              q.question.toLowerCase().includes('image');
            const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
            return hasValidOptions && hasImageIfRequired;
          });

          console.log(`Valid random questions for ${normalizedSubject}: ${validQuestions.length}`);

          // Step 3: Fetch from Myschool.ng only if still insufficient
          if (validQuestions.length < targetQuestions) {
            console.log(`Still insufficient (${validQuestions.length}/${targetQuestions}), fetching from Myschool.ng...`);
            try {
              const fetchedQuestions = await fetchMyschoolQuestions(
                'jamb' as ExamType,
                normalizedSubject,
                examYear
              );
              const neededQuestions = fetchedQuestions.slice(0, targetQuestions - validQuestions.length);
              console.log(`Fetched ${neededQuestions.length} questions from Myschool.ng for ${normalizedSubject}`);

              await prisma.question.createMany({
                data: neededQuestions,
                skipDuplicates: true,
              });

              const newQuestions = await prisma.question.findMany({
                where: {
                  examType: 'jamb',
                  examSubject: normalizedSubject,
                  examYear,
                },
                take: targetQuestions - validQuestions.length,
              }).then(questions => questions.filter(q => {
                const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                const requiresImage = q.question.toLowerCase().includes('diagram') ||
                  q.question.toLowerCase().includes('figure') ||
                  q.question.toLowerCase().includes('image');
                const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                return hasValidOptions && hasImageIfRequired;
              }));
              validQuestions = [
                ...validQuestions,
                ...newQuestions.filter(q => !validQuestions.some(vq => vq.id === q.id)),
              ].slice(0, targetQuestions);
              console.log(`After Myschool fetch: ${validQuestions.length}`);
            } catch (myschoolError: any) {
              console.error(`Myschool fetch failed for ${normalizedSubject}: ${myschoolError.message}`);
            }
          }

          // Step 4: Finalize with exact count
          const finalQuestions = shuffleArray(validQuestions).slice(0, targetQuestions);
          if (finalQuestions.length < targetQuestions) {
            console.warn(`Warning: Only ${finalQuestions.length}/${targetQuestions} questions available for ${normalizedSubject}`);
          }
          console.log(`Final questions for ${normalizedSubject}: ${finalQuestions.length}`);

          return {
            subject: formatSubjectForFrontend(normalizedSubject),
            questions: finalQuestions.map((q) => {
              console.log(q.id)
              return {
                id: q.id,
                question: q.question,
                options: q.options,
                answer: q.answer ?? undefined,
                imageUrl: q.imageUrl ?? undefined,
              }
            }),
          };
        })
      );

      console.log(`Total questions selected for session: ${subjectQuestions.reduce((sum, sq) => sum + sq.questions.length, 0)}`);
      return subjectQuestions;
    },

    me: async (_: any, __: any, context: Context) => {
      const studentId = authMiddleware(context);
      const student = await prisma.student.findUnique({
        where: { id: studentId },
      });

      if (!student) {
        throw new ApolloError('Student not found', 'NOT_FOUND');
      }

      return {
        ...student,
        createdAt: student.createdAt.toISOString(),
        updatedAt: student.updatedAt.toISOString(),
      };
    },
  },

  Mutation: {
    registerStudent: async (
      _: any,
      { input }: { input: { firstName: string; lastName: string; userName: string; email?: string; phoneNumber?: string; password: string; studentType?: string } }
    ) => {
      try {
        const { firstName, lastName, userName, email, phoneNumber, password, studentType } = input;

        if (!firstName || !lastName || !userName || !password) {
          throw new ApolloError('First name, last name, username, and password are required', 'VALIDATION_ERROR', {
            missingFields: Object.keys({ firstName, lastName, userName, password }).filter(key => !input[key as keyof typeof input]),
          });
        }

        if (email && (!email.includes('@') || !email.includes('.'))) {
          throw new ApolloError('Invalid email format', 'VALIDATION_ERROR', { field: 'email' });
        }

        if (phoneNumber) {
          const phoneDigits = phoneNumber.replace(/\D/g, '');
          if (phoneDigits.length !== 11) {
            throw new ApolloError('Phone number must be exactly 11 digits', 'VALIDATION_ERROR', {
              field: 'phoneNumber',
              receivedLength: phoneDigits.length,
            });
          }
        }

        if (password.length < 8) {
          throw new ApolloError('Password must be at least 8 characters', 'VALIDATION_ERROR', { field: 'password' });
        }

        if (studentType && !['SCIENCE', 'ART'].includes(studentType)) {
          throw new ApolloError('Invalid student type', 'VALIDATION_ERROR', { field: 'studentType' });
        }

        const existingStudent = await prisma.student.findFirst({
          where: { OR: [{ userName }, ...(email ? [{ email }] : [])] },
        });

        if (existingStudent) {
          if (existingStudent.userName === userName && email && existingStudent.email === email) {
            throw new ApolloError('Username and email already exist', 'DUPLICATE_USER', { fields: ['userName', 'email'] });
          } else if (existingStudent.userName === userName) {
            throw new ApolloError('Username already exists', 'DUPLICATE_USER', { field: 'userName' });
          } else if (email && existingStudent.email === email) {
            throw new ApolloError('Email already exists', 'DUPLICATE_USER', { field: 'email' });
          }
        }

        const hashedPassword = await hash(password, 10);
        const student = await prisma.student.create({
          data: {
            firstName,
            lastName,
            userName,
            email: email || null,
            phoneNumber: phoneNumber || null,
            password: hashedPassword,
            studentType,
          },
        });

        return {
          ...student,
          createdAt: student.createdAt.toISOString(),
          updatedAt: student.updatedAt.toISOString(),
        };
      } catch (error: unknown) {
        if (error instanceof ApolloError) throw error;
        const err = error as Error;
        throw new ApolloError('Registration failed', 'INTERNAL_SERVER_ERROR', { originalError: err.message });
      }
    },

    loginStudent: async (_: any, { input }: { input: { identifier: string; password: string } }) => {
      try {
        const { identifier, password } = input;

        if (!identifier || !password) {
          throw new ApolloError('Identifier and password are required', 'VALIDATION_ERROR', {
            missingFields: Object.keys(input).filter(key => !input[key as keyof typeof input]),
          });
        }

        const student = await prisma.student.findFirst({
          where: { OR: [{ userName: identifier }, { email: identifier }] },
        });

        if (!student) {
          throw new ApolloError('Invalid credentials', 'AUTHENTICATION_FAILED');
        }

        const isPasswordValid = await compare(password, student.password);
        if (!isPasswordValid) {
          throw new ApolloError('Invalid credentials', 'AUTHENTICATION_FAILED');
        }

        const token = jwt.sign(
          { id: student.id, userName: student.userName },
          process.env.JWT_SECRET || 'your-secret-key',
        );

        return {
          success: true,
          message: 'Login successful',
          token,
          student: {
            ...student,
            createdAt: student.createdAt.toISOString(),
            updatedAt: student.updatedAt.toISOString(),
          },
        };
      } catch (error: unknown) {
        if (error instanceof ApolloError) throw error;
        const err = error as Error;
        throw new ApolloError('Login failed', 'INTERNAL_SERVER_ERROR', { originalError: err.message });
      }
    },

    startJambExam: async (
      _: any,
      { subjects, examYear, isCompetition }: { subjects: string[]; examYear: string; isCompetition: boolean },
      context: Context
    ) => {
      const studentId = authMiddleware(context);
      const normalizedSubjects = subjects.map(normalizeSubject);
      const uniqueSubjects = new Set(normalizedSubjects);
      if (uniqueSubjects.size !== 4) throw new ApolloError('Exactly 4 unique subjects required', 'VALIDATION_ERROR');
      if (!uniqueSubjects.has('english-language')) throw new ApolloError('English Language is compulsory', 'VALIDATION_ERROR');
      if (!isCompetition && !YEARS.includes(examYear as any)) throw new ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');


      const VALID_SUBJECTS: ExamSubject[] = [
        'mathematics', 'english-language', 'fine-arts', 'music', 'french', 'animal-husbandry', 'insurance', 'chemistry',
        'physics', 'yoruba', 'biology', 'geography', 'literature-in-english', 'economics', 'commerce',
        'accounts-principles-of-accounts', 'government', 'igbo', 'christian-religious-knowledge', 'agricultural-science',
        'islamic-religious-knowledge', 'history', 'civic-education', 'further-mathematics', 'arabic', 'home-economics',
        'hausa', 'book-keeping', 'data-processing', 'catering-craft-practice', 'computer-studies', 'marketing',
        'physical-education', 'office-practice', 'technical-drawing', 'food-and-nutrition', 'home-management'
      ];
      const invalidSubjects = Array.from(uniqueSubjects).filter(sub => !VALID_SUBJECTS.includes(sub));
      if (invalidSubjects.length > 0) throw new ApolloError(`Invalid subjects: ${invalidSubjects.join(', ')}`, 'VALIDATION_ERROR');

      const newSession = await prisma.jambExamSession.create({
        data: {
          subjects: Array.from(uniqueSubjects),
          examYear: examYear ? examYear : String(new Date().getFullYear()),
          startTime: new Date(),
          isCompleted: false,
          studentId,
          isCompetition: isCompetition ? isCompetition : false
        },
      });

      return {
        id: newSession.id,
        subjects: newSession.subjects.map(formatSubjectForFrontend),
        startTime: newSession.startTime.toISOString(),
        endTime: newSession.endTime?.toISOString() || null,
        isCompleted: newSession.isCompleted,
        scores: [],
        remainingTime: '90min 0s',
      };
    },

    finishJambExam: async (
      _: any,
      { sessionId, answers, questionIds }: { sessionId: number; answers?: { questionId: string; answer: string }[], questionIds: string[] },
      context: Context
    ) => {
      const studentId = authMiddleware(context);
      const session = await prisma.jambExamSession.findUnique({
        where: { id: sessionId },
        include: { answers: true },
      });
      if (!session) throw new ApolloError('Session not found', 'NOT_FOUND');
      if (session.studentId !== studentId) throw new ApolloError('Unauthorized access to session', 'FORBIDDEN');
      if (session.isCompleted) throw new ApolloError('JAMB session already completed', 'INVALID_STATE');

      const allSubjects = session.subjects.map(normalizeSubject);
      const targetCounts = allSubjects.map(subject => ({
        subject,
        count: subject === 'english-language' ? 60 : 40,
      }));

      // Fetch questions used in this session (based on what fetchJambSubjectQuestions would return)
      const questionsBySubject = await Promise.all(
        targetCounts.map(async ({ subject, count }) => {
          let questions = await prisma.question.findMany({ 
            where: { examType: 'jamb', examSubject: subject, examYear: session.examYear },
            take: count,
          }).then(qs => qs.filter(q => {
            const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
            const requiresImage = q.question.toLowerCase().includes('diagram') ||
              q.question.toLowerCase().includes('figure') ||
              q.question.toLowerCase().includes('image');
            const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
            return hasValidOptions && hasImageIfRequired;
          }));

          if (questions.length < count) {
            const additionalQuestions = await prisma.question.findMany({
              where: { examType: 'jamb', examSubject: subject, examYear: { not: session.examYear } },
              take: count - questions.length,
            }).then(qs => qs.filter(q => {
              const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
              const requiresImage = q.question.toLowerCase().includes('diagram') ||
                q.question.toLowerCase().includes('figure') ||
                q.question.toLowerCase().includes('image');
              const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
              return hasValidOptions && hasImageIfRequired;
            }));
            questions = [...questions, ...additionalQuestions].slice(0, count);
          }

          return { subject, questions };
        })
      );

      const questionMap = new Map<string, { answer: string | null; options: string[] }>();
      questionsBySubject.forEach(({ questions }) => {
        questions.forEach(q => questionMap.set(q.id, { answer: q.answer, options: q.options }));
      });

      // Store or update answers
      if (answers && answers.length > 0) {
        await prisma.$transaction(
          answers.map(({ questionId, answer }) =>
            prisma.answer.upsert({
              where: { sessionId_questionId: { sessionId, questionId } },
              update: { answer },
              create: { sessionId, questionId, answer },
            })
          )
        );
      }

      // Fetch all answers for scoring
      const sessionAnswers = await prisma.answer.findMany({
        where: { sessionId },
      });

      const answerMap = new Map<string, string>();
      sessionAnswers.forEach(a => answerMap.set(a.questionId, a.answer));

      // Calculate scores
      const subjectScores = questionsBySubject.map(({ subject, questions }) => {
        const correctAnswers = questions.reduce((acc, q) => {
          const submittedAnswer = answerMap.get(q.id);
          if (!submittedAnswer) return acc; // No answer submitted, no points

          const correctAnswer = q.answer;
          if (!correctAnswer) return acc; // No correct answer defined, no points

          // Handle both letter-based (a, b, c, d) and text-based answers
          const submittedOptionText = ['a', 'b', 'c', 'd'].includes(submittedAnswer.toLowerCase())
            ? q.options[['a', 'b', 'c', 'd'].indexOf(submittedAnswer.toLowerCase())] || submittedAnswer
            : submittedAnswer;

          return acc + (submittedOptionText === correctAnswer ? 1 : 0);
        }, 0);

        return { subject, correctAnswers, questionCount: questions.length };
      });

      // Calculate the total number of questions across all subjects
      const totalQuestions = subjectScores.reduce((acc, { questionCount }) => acc + questionCount, 0);
      const totalCorrectAnswers = subjectScores.reduce((acc, { correctAnswers }) => acc + correctAnswers, 0);

      // Scale the score to a maximum of 400 points
      const scaledTotalScore = Math.round((totalCorrectAnswers / totalQuestions) * 400);

      // Calculate scaled scores for each subject
      const scaledSubjectScores = subjectScores.map(({ subject, correctAnswers, questionCount }) => {
        // Each subject's score is scaled proportionally to maintain the 400 total
        const maxSubjectScore = Math.round((questionCount / totalQuestions) * 400);
        const scaledScore = Math.round((correctAnswers / questionCount) * maxSubjectScore);
        return { subject, score: scaledScore, questionCount };
      });

      // Update scores in the database
      const subjectRecords = await prisma.subject.findMany({
        where: { name: { in: allSubjects }, examType: 'jamb' },
      });
      const subjectMap = new Map(subjectRecords.map(s => [normalizeSubject(s.name), s.id]));

      const missingSubjects = allSubjects.filter(subject => !subjectMap.has(subject));
      if (missingSubjects.length > 0) {
        const newSubjects = await prisma.$transaction(
          missingSubjects.map(subject =>
            prisma.subject.upsert({
              where: { name_examType: { name: subject, examType: 'jamb' } },
              update: {},
              create: { name: subject, examType: 'jamb' },
            })
          )
        );
        newSubjects.forEach(s => subjectMap.set(normalizeSubject(s.name), s.id));
      }

      await prisma.$transaction(
        scaledSubjectScores.map(({ subject, score }) =>
          prisma.score.upsert({
            where: { jambSessionId_examSubject: { jambSessionId: sessionId, examSubject: subject } },
            update: { score },
            create: {
              examType: 'jamb',
              examSubject: subject,
              subjectId: subjectMap.get(subject)!,
              examYear: session.examYear,
              score,
              date: new Date(),
              jambSessionId: sessionId,
            },
          })
        )
      );

      // Mark session as completed
      const updatedSession = await prisma.jambExamSession.update({
        where: { id: sessionId },
        data: { isCompleted: true, endTime: new Date() },
        include: { scores: true },
      });

      // Prepare answer feedback for requested questionIds
      const questionDetails = await Promise.all(
        questionIds.map(async (qid) => {
          const questionData = questionMap.get(qid);
          const studentAnswer = answerMap.get(qid) || null;

          return {
            questionId: qid,
            correctAnswer: questionData?.answer || null,
            studentAnswer,
            isCorrect: studentAnswer === questionData?.answer
          };
        })
      );

      const elapsedTime = new Date(updatedSession.endTime!).getTime() - new Date(session.startTime).getTime();
      const totalSeconds = Math.floor(elapsedTime / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      let timeSpent = '';
      if (hours > 0) timeSpent += `${hours}hr `;
      if (minutes > 0 || hours > 0) timeSpent += `${minutes}min `;
      timeSpent += `${seconds}s`;

      return {
        sessionId,
        subjectScores: scaledSubjectScores.map(({ subject, score, questionCount }) => ({
          examSubject: formatSubjectForFrontend(subject),
          score,
          questionCount,
        })),
        totalScore: scaledTotalScore, // Scaled to max 400
        isCompleted: updatedSession.isCompleted,
        timeSpent: timeSpent.trim(),
        questionDetails, // Added to return detailed information about answers
      };
    },
  },

  JambExamSession: {
    remainingTime: (parent: { startTime: Date; endTime?: Date | null; isCompleted: boolean }) => {
      if (parent.isCompleted || parent.endTime) return '0s';
      const elapsed = Date.now() - new Date(parent.startTime).getTime();
      const remaining = JAMB_TIME_LIMIT - elapsed;
      const totalSeconds = Math.max(Math.floor(remaining / 1000), 0);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      let remainingTimeStr = '';
      if (hours > 0) remainingTimeStr += `${hours}hr `;
      if (minutes > 0 || hours > 0) remainingTimeStr += `${minutes}min `;
      remainingTimeStr += `${seconds}s`;
      return remainingTimeStr.trim();
    },
  },
};