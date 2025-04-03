"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.competitionTypeDefs = void 0;
const graphql_tag_1 = require("graphql-tag");
exports.competitionTypeDefs = (0, graphql_tag_1.gql) `
 
 type LeaderboardStudent {
    id: Int!
    firstName: String!
    lastName: String!
    userName: String!
    studentType: String!
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
