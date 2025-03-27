// src/resolvers/jamb.ts
import { PrismaClient } from '@prisma/client';
import { hash, compare } from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ApolloError } from 'apollo-server-express';

const prisma = new PrismaClient();
const JAMB_TIME_LIMIT = 5400 * 1000; // 90 minutes in milliseconds
const YEARS = [
  '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
  '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'
];

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

export const jambResolvers = {
  Query: {
    years: () => YEARS,

    fetchJambSubjectQuestions: async (_: any, { sessionId }: { sessionId: number }, context: Context) => {
      const studentId = authMiddleware(context);
      const session = await prisma.jambExamSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new ApolloError('Session not found', 'NOT_FOUND');
      if (session.studentId !== studentId) throw new ApolloError('Unauthorized access to session', 'FORBIDDEN');
      if (session.isCompleted) throw new ApolloError('Session already completed', 'INVALID_STATE');

      const subjectQuestions = await Promise.all(
        session.subjects.map(async (subject) => {
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
      { input }: { input: { firstName: string; lastName: string; userName: string; email: string; phoneNumber: string; password: string; studentType?: string } }
    ) => {
      try {
        const { firstName, lastName, userName, email, phoneNumber, password, studentType } = input;

        if (!firstName || !lastName || !userName || !email || !phoneNumber || !password) {
          throw new ApolloError('All fields except studentType are required', 'VALIDATION_ERROR', {
            missingFields: Object.keys(input).filter(key => !input[key as keyof typeof input]),
          });
        }

        if (!email.includes('@') || !email.includes('.')) {
          throw new ApolloError('Invalid email format', 'VALIDATION_ERROR', { field: 'email' });
        }

        const phoneDigits = phoneNumber.replace(/\D/g, '');
        if (phoneDigits.length !== 11) {
          throw new ApolloError('Phone number must be exactly 11 digits', 'VALIDATION_ERROR', {
            field: 'phoneNumber',
            receivedLength: phoneDigits.length,
          });
        }

        if (password.length < 8) {
          throw new ApolloError('Password must be at least 8 characters', 'VALIDATION_ERROR', {
            field: 'password',
          });
        }

        if (studentType && !['SCIENCE', 'ART'].includes(studentType)) {
          throw new ApolloError('Invalid student type', 'VALIDATION_ERROR', { field: 'studentType' });
        }

        const existingStudent = await prisma.student.findFirst({
          where: { OR: [{ userName }, { email }] },
        });

        if (existingStudent) {
          if (existingStudent.userName === userName && existingStudent.email === email) {
            throw new ApolloError('Username and email already exist', 'DUPLICATE_USER', { fields: ['userName', 'email'] });
          } else if (existingStudent.userName === userName) {
            throw new ApolloError('Username already exists', 'DUPLICATE_USER', { field: 'userName' });
          } else {
            throw new ApolloError('Email already exists', 'DUPLICATE_USER', { field: 'email' });
          }
        }

        const hashedPassword = await hash(password, 10);
        const student = await prisma.student.create({
          data: {
            firstName,
            lastName,
            userName,
            email,
            phoneNumber,
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
          { expiresIn: '1h' }
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
      { subjects, examYear }: { subjects: string[]; examYear: string },
      context: Context
    ) => {
      const studentId = authMiddleware(context);
      const trimmedSubjects = subjects.map(s => s.trim().toLowerCase());
      if (trimmedSubjects.length !== 4) throw new ApolloError('Exactly 4 subjects required', 'VALIDATION_ERROR');
      if (!trimmedSubjects.includes('english language')) throw new ApolloError('English Language is compulsory', 'VALIDATION_ERROR');
      if (!YEARS.includes(examYear)) throw new ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');

      const validSubjects = ['english language', 'mathematics', 'physics', 'chemistry', 'biology', 'literature', 'government', 'economics'];
      const invalidSubjects = trimmedSubjects.filter(sub => !validSubjects.includes(sub));
      if (invalidSubjects.length > 0) throw new ApolloError(`Invalid subjects: ${invalidSubjects.join(', ')}`, 'VALIDATION_ERROR');

      const newSession = await prisma.jambExamSession.create({
        data: {
          subjects: trimmedSubjects,
          examYear,
          startTime: new Date(),
          isCompleted: false,
          studentId,
        },
      });

      return {
        id: newSession.id,
        subjects: newSession.subjects,
        startTime: newSession.startTime.toISOString(),
        endTime: newSession.endTime?.toISOString() || null,
        isCompleted: newSession.isCompleted,
        scores: [],
        remainingTime: '90min 0s', // Initial value, updated by field resolver
      };
    },

    finishJambExam: async (
      _: any,
      { sessionId, answers }: { sessionId: number; answers?: { questionId: string; answer: string }[] },
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

      const allSubjects = session.subjects;
      const questions = await prisma.question.findMany({
        where: { examType: 'jamb', examSubject: { in: allSubjects }, examYear: session.examYear },
      });

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

      const sessionAnswers = await prisma.answer.findMany({
        where: { sessionId },
        include: { question: true },
      });

      const subjectRecords = await prisma.subject.findMany({
        where: { name: { in: allSubjects }, examType: 'jamb' },
      });
      let subjectMap = new Map(subjectRecords.map(s => [s.name.toLowerCase(), s.id]));

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
        newSubjects.forEach(s => subjectMap.set(s.name.toLowerCase(), s.id));
      }

      const subjectScores = allSubjects.map(subject => {
        const subjectQuestions = questions.filter(q => q.examSubject === subject).slice(0, 20);
        const subjectAnswers = sessionAnswers.filter(a => subjectQuestions.some(q => q.id === a.questionId));

        const score = subjectAnswers.reduce((acc, { question, answer }) => {
          const submittedOptionText = ['a', 'b', 'c', 'd'].includes(answer.toLowerCase())
            ? question.options[['a', 'b', 'c', 'd'].indexOf(answer.toLowerCase())]
            : answer;
          return acc + (question.answer === submittedOptionText ? 1 : 0);
        }, 0);

        return {
          examType: 'jamb',
          examSubject: subject,
          subjectId: subjectMap.get(subject)!,
          examYear: session.examYear,
          score,
          date: new Date(),
          jambSessionId: sessionId,
        };
      });

      await prisma.$transaction(
        subjectScores.map(score =>
          prisma.score.upsert({
            where: { jambSessionId_examSubject: { jambSessionId: sessionId, examSubject: score.examSubject } },
            update: { score: score.score },
            create: score,
          })
        )
      );

      const updatedSession = await prisma.jambExamSession.update({
        where: { id: sessionId },
        data: { isCompleted: true, endTime: new Date() },
        include: { scores: true },
      });

      const totalScore = updatedSession.scores.reduce((sum, score) => sum + score.score, 0);
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
        subjectScores: updatedSession.scores.map(score => ({
          examSubject: score.examSubject,
          score: score.score,
        })),
        totalScore,
        isCompleted: updatedSession.isCompleted,
        timeSpent: timeSpent.trim(),
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