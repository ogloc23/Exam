import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011', 
  '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', 
  '2020', '2021', '2022', '2023'];
const JAMB_TIME_LIMIT = 5400 * 1000;

// Utility function to shuffle an array (Fisher-Yates shuffle)
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
    fetchJambSubjectQuestions: async (_: any, { sessionId }: { sessionId: number }) => {
      const session = await prisma.jambExamSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new Error('Session not found');

      const questions = await prisma.question.findMany({
        where: { 
          examType: 'jamb', 
          examSubject: { in: session.subjects }, 
          examYear: session.examYear 
        },
      });

      return session.subjects.map(subject => {
        // Filter questions for the current subject
        const subjectQuestions = questions.filter(q => q.examSubject === subject);
        // Shuffle and take the first 20 (or all if fewer than 20)
        const shuffledQuestions = shuffleArray(subjectQuestions).slice(0, 20);
        
        return {
          subject,
          questions: shuffledQuestions.map(q => ({
            id: q.id,
            question: q.question,
            options: q.options,
          })),
        };
      });
    },
  },

  Mutation: {
    startJambExam: async (_: any, { subjects, examYear }: { subjects: string[]; examYear: string }) => {
      const trimmedSubjects = subjects.map(s => s.trim().toLowerCase());
      if (trimmedSubjects.length !== 4) throw new Error('Exactly 4 subjects required');
      if (!trimmedSubjects.includes('english language')) throw new Error('English Language is compulsory');
      if (!YEARS.includes(examYear)) throw new Error(`Invalid year: ${examYear}`);

      const validSubjects = ['english language', 'mathematics', 'physics', 'chemistry'];
      const invalidSubjects = trimmedSubjects.filter(sub => !validSubjects.includes(sub));
      if (invalidSubjects.length > 0) throw new Error(`Invalid subjects: ${invalidSubjects.join(', ')}`);

      const newSession = await prisma.jambExamSession.create({
        data: {
          subjects: trimmedSubjects,
          examYear,
          startTime: new Date(),
          isCompleted: false,
        },
      });
      console.log('Created session:', newSession);
      return newSession;
    },

    finishJambExam: async (
      _: any,
      { sessionId, answers }: { sessionId: number; answers?: { questionId: string; answer: string }[] }
    ) => {
      const session = await prisma.jambExamSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new Error('Session not found');
      if (session.isCompleted) throw new Error('JAMB session already completed');

      const allSubjects = session.subjects;
      const questions = await prisma.question.findMany({
        where: { examType: 'jamb', examSubject: { in: allSubjects }, examYear: session.examYear },
      });

      // Define subjectMap
      const subjectRecords = await prisma.subject.findMany({
        where: { name: { in: allSubjects }, examType: 'jamb' },
      });
      let subjectMap = new Map(subjectRecords.map(s => [s.name.toLowerCase(), s.id]));

      // Handle missing subjects
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

      // Process answers from frontend
      const sessionAnswers = answers || [];
      console.log(`Received ${sessionAnswers.length} answers for session ${sessionId}`);

      const subjectScores = allSubjects.map(subject => {
        const subjectQuestions = questions.filter(q => q.examSubject === subject).slice(0, 20); // Already limited to 20 in fetch
        const subjectAnswers = sessionAnswers.filter(a => subjectQuestions.some(q => q.id === a.questionId));
        console.log(`Subject: ${subject}, Questions: ${subjectQuestions.length}, Answers: ${subjectAnswers.length}`);
        
        const score = subjectAnswers.reduce((acc, { questionId, answer }) => {
          const question = subjectQuestions.find(q => q.id === questionId);
          if (!question) {
            console.log(`Question ${questionId} not found in scored set`);
            return acc;
          }
          const optionIndex = ['a', 'b', 'c', 'd', 'e'].indexOf(answer.toLowerCase());
          const submittedOptionText = optionIndex !== -1 && question.options[optionIndex]
            ? question.options[optionIndex]
            : answer;
          console.log(`Scoring: ${questionId}, Submitted: ${answer} (${submittedOptionText}), Correct: ${question.answer}`);
          return acc + (question.answer === submittedOptionText ? 1 : 0);
        }, 0);
        console.log(`Score for ${subject}: ${score}`);
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
      const elapsedTime = Date.now() - new Date(session.startTime).getTime();
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
    remainingTime: (parent: { startTime: Date; isCompleted: boolean }) => {
      if (parent.isCompleted) return "0s";
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