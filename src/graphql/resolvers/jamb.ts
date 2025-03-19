import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011', 
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', 
    '2020', '2021', '2022', '2023'];
const JAMB_TIME_LIMIT = 5400 * 1000; // 90 minutes in milliseconds

export const jambResolvers = {
  Query: {
    fetchJambSubjectQuestions: async (
      _: any,
      { sessionId }: { sessionId: number }
    ) => {
      const session = await prisma.jambExamSession.findUnique({
        where: { id: sessionId },
      });
      if (!session || session.isCompleted) {
        throw new Error('Invalid or completed JAMB session');
      }
      if (!session.currentSubject) {
        throw new Error('No current subject to fetch questions for');
      }

      const examSubject = session.currentSubject.replace(' (JAMB)', '').toLowerCase();
      const questions = await prisma.question.findMany({
        where: {
          examType: 'jamb',
          examSubject,
          examYear: session.examYear,
        },
        take: 20,
      });

      if (questions.length < 20) {
        throw new Error(`Insufficient questions for ${examSubject}: got ${questions.length}, need 20`);
      }

      return questions.map(q => ({
        id: q.id,
        question: q.question,
        options: q.options,
      }));
    },
  },

  Mutation: {
    startJambExam: async (
      _: any,
      { subjects, examYear }: { subjects: string[]; examYear: string }
    ) => {
      if (subjects.length !== 4) {
        throw new Error('Exactly 4 subjects must be selected for JAMB exam');
      }
      if (!subjects.includes('English Language (JAMB)')) {
        throw new Error('English Language is compulsory for JAMB');
      }
      if (!YEARS.includes(examYear)) {
        throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
      }

      const jambSubjects = await prisma.subject.findMany({
        where: { examType: 'jamb' },
      });
      const validSubjects = jambSubjects.map(s => s.name);
      if (!subjects.every(sub => validSubjects.includes(sub))) {
        throw new Error('Invalid JAMB subjects selected');
      }

      return await prisma.jambExamSession.create({
        data: {
          subjects,
          currentSubject: subjects[0],
          examYear,
          startTime: new Date(),
          isCompleted: false,
        },
      });
    },

    submitJambAnswer: async (
      _: any,
      { sessionId, answers }: { 
        sessionId: number; 
        answers: { questionId: string; answer: string }[] 
      }
    ) => {
      const session = await prisma.jambExamSession.findUnique({
        where: { id: sessionId },
        include: { scores: true },
      });
      if (!session || session.isCompleted) {
        throw new Error('Invalid or completed JAMB session');
      }
      if (!session.currentSubject) {
        throw new Error('No current subject to submit answers for');
      }

      const startTime = new Date(session.startTime).getTime();
      const currentTime = new Date().getTime();
      if (currentTime - startTime > JAMB_TIME_LIMIT) {
        await autoSubmitJambExam(sessionId);
        throw new Error('Time limit exceeded, exam auto-submitted');
      }

      const formattedSubject = session.currentSubject;
      const examSubject = formattedSubject.replace(' (JAMB)', '').toLowerCase();

      const questions = await prisma.question.findMany({
        where: {
          examType: 'jamb',
          examSubject,
          examYear: session.examYear,
          id: { in: answers.map(a => a.questionId) },
        },
      });

      if (questions.length !== answers.length) {
        throw new Error('Some question IDs not found or invalid for this subject');
      }

      let score = 0;
      answers.forEach(({ questionId, answer }) => {
        const question = questions.find(q => q.id === questionId);
        if (question && question.answer === answer.toLowerCase()) {
          score++;
        }
      });

      const subject = await prisma.subject.findFirst({
        where: { name: formattedSubject },
      });
      if (!subject) {
        throw new Error(`Subject ${formattedSubject} not found`);
      }

      await prisma.score.create({
        data: {
          examType: 'jamb',
          examSubject,
          subjectId: subject.id,
          examYear: session.examYear,
          score,
          jambSessionId: sessionId,
        },
      });

      const nextSubjectIndex = session.subjects.indexOf(formattedSubject) + 1;
      const nextSubject = nextSubjectIndex < session.subjects.length ? session.subjects[nextSubjectIndex] : null;
      await prisma.jambExamSession.update({
        where: { id: sessionId },
        data: { currentSubject: nextSubject },
      });

      return { success: true };
    },

    finishJambExam: async (_: any, { sessionId }: { sessionId: number }) => {
      const session = await prisma.jambExamSession.findUnique({
        where: { id: sessionId },
        include: { scores: true },
      });
      if (!session) {
        throw new Error('Session not found');
      }
      if (session.isCompleted) {
        throw new Error('JAMB session already completed');
      }

      const startTime = new Date(session.startTime).getTime();
      const currentTime = new Date().getTime();
      if (currentTime - startTime > JAMB_TIME_LIMIT) {
        await autoSubmitJambExam(sessionId);
      }

      const updatedSession = await prisma.jambExamSession.update({
        where: { id: sessionId },
        data: { isCompleted: true, endTime: new Date() },
        include: { scores: true },
      });

      const totalScore = updatedSession.scores.reduce((sum, score) => sum + score.score, 0);
      return {
        sessionId,
        subjectScores: updatedSession.scores,
        totalScore,
        isCompleted: updatedSession.isCompleted,
      };
    },
  },

  // Add resolver for JambExamSession
  JambExamSession: {
    remainingTime: (parent: { startTime: Date; isCompleted: boolean }) => {
      if (parent.isCompleted) return 0; // No time left if completed
      const startTime = new Date(parent.startTime).getTime();
      const currentTime = new Date().getTime();
      const elapsed = currentTime - startTime;
      const remaining = JAMB_TIME_LIMIT - elapsed;
      return remaining > 0 ? Math.floor(remaining / 1000) : 0; // Seconds remaining
    },
  },
};

async function autoSubmitJambExam(sessionId: number) {
  const session = await prisma.jambExamSession.findUnique({
    where: { id: sessionId },
    include: { scores: true },
  });
  if (!session || session.isCompleted) return;

  const remainingSubjects = session.subjects.filter(
    subject => !session.scores.some(score => score.examSubject === subject.replace(' (JAMB)', '').toLowerCase())
  );

  for (const subject of remainingSubjects) {
    const subjectRecord = await prisma.subject.findFirst({ where: { name: subject } });
    if (!subjectRecord) continue;

    await prisma.score.create({
      data: {
        examType: 'jamb',
        examSubject: subject.replace(' (JAMB)', '').toLowerCase(),
        subjectId: subjectRecord.id,
        examYear: session.examYear,
        score: 0,
        jambSessionId: sessionId,
      },
    });
  }

  await prisma.jambExamSession.update({
    where: { id: sessionId },
    data: { isCompleted: true, endTime: new Date() },
  });
}