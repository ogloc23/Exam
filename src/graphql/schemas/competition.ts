import { gql } from 'graphql-tag';

export const competitionTypeDefs = gql`
 
 type LeaderboardStudent {
    id: Int!
    firstName: String!
    lastName: String!
    userName: String!
  }

  type SubjectScore {
    subject: String!
    score: Int!
  }

  type LeaderboardEntry {
    rank: Int!
    studentId: Int!
    student: LeaderboardStudent!
    score: Int!
    submittedAt: DateTime!
    subjectScores: [SubjectScore!]!
  }

  type Query {
    getCompetitionLeaderboard(date: String): [LeaderboardEntry!]!
  }
`;