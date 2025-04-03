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
          },
          orderBy: {
            startTime: 'asc' // Default ordering until we calculate total scores
          }
        });

        if (competitionSessions.length === 0) {
          return []; // No competitions found for this date
        }

        // Calculate total score for each session and sort
        const rankedLeaderboard = competitionSessions
        .map(session => ({
          studentId: session.studentId,
          student: session.student,
          score: session.scores.reduce((sum, score) => sum + score.score, 0), // Total score
          submittedAt: session.endTime || session.startTime, // Use endTime if available
          subjectScores: session.scores.map(score => ({
            subject: score.examSubject,
            score: score.score
          }))
        }))
        .sort((a, b) => b.score - a.score) // Sort by total score descending
        .reduce((acc, session) => {
          if (!acc.has(session.studentId)) {
            acc.set(session.studentId, session); // Store only the highest-scoring session per student
          }
          return acc;
        }, new Map())
        .values(); // Get the unique highest-scoring sessions
      
      // Convert to array and assign ranks
      const finalLeaderboard = [...rankedLeaderboard].map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
      
      console.log(finalLeaderboard);
      

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