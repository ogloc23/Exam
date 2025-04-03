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
          .map(session => {
            // Calculate total score from all subject scores
            const totalScore = session.scores.reduce((sum, score) => sum + score.score, 0);
            
            return {
              rank: 0, // Will be assigned after sorting
              studentId: session.studentId,
              student: session.student,
              score: totalScore,
              submittedAt: session.endTime || session.startTime, // Use endTime if available
              subjectScores: session.scores.map(score => ({
                subject: score.examSubject,
                score: score.score
              }))
            };
          })
          .sort((a, b) => b.score - a.score) // Sort by score in descending order
          .map((entry, index) => ({
            ...entry,
            rank: index + 1 // Assign rank based on sorted position
          }));

        return rankedLeaderboard;
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