import { ApolloError } from 'apollo-server-express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

export const competitionResolvers = {
  Query: {
    getCompetitionLeaderboard: async (_: any, { date }: { date?: string }) => {
      try {
        // If date is not provided, use current date
        const targetDate = date ? new Date(date) : new Date();
        const startOfDay = new Date(new Date(targetDate).setHours(0, 0, 0, 0));
        const endOfDay = new Date(new Date(targetDate).setHours(23, 59, 59, 999));
        
        // Find all completed competition exam sessions for the given date
        const competitionSessions = await prisma.jambExamSession.findMany({
          where: {
            isCompetition: true,
            isCompleted: true,
            startTime: {
              gte: startOfDay,
              lte: endOfDay
            }
          },
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                userName: true,
                studentType: true,
              }
            },
            scores: true
          }
        });
        
        if (competitionSessions.length === 0) {
          return []; // No competitions found for this date
        }
        
        // Calculate total score for each session
        const sessionsWithTotalScores = competitionSessions.map(session => ({
          studentId: session.studentId,
          student: session.student,
          score: session.scores.reduce((sum, score) => sum + score.score, 0),
          submittedAt: session.endTime || session.startTime,
          subjectScores: session.scores.map(score => ({
            subject: score.examSubject,
            score: score.score
          }))
        }));
         
        // Group sessions by student ID
        const studentMap = new Map();
        
        // For each session, keep only the highest score per student
        sessionsWithTotalScores.forEach(session => {
          const existingSession = studentMap.get(session.studentId);
          
          // If we don't have this student yet, or if this score is higher than previous best
          if (!existingSession || session.score > existingSession.score) {
            studentMap.set(session.studentId, session);
          }
        });
        
        // Convert map back to array
        const bestAttempts = Array.from(studentMap.values());
        
        // Sort by score in descending order
        const sortedLeaderboard = bestAttempts.sort((a, b) => b.score - a.score);
        
        // Assign ranks
        const finalLeaderboard = sortedLeaderboard.map((entry, index) => ({
          ...entry,
          rank: index + 1
        }));
        
        return finalLeaderboard;
      } catch (error) {
        console.error('Error fetching competition leaderboard:', error);
        throw new ApolloError(
          'Failed to retrieve competition leaderboard',
          'DATABASE_ERROR'
        );
      }
    },
  },

  Mutation: {},
};