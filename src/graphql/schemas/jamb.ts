// src/graphql/schemas/jamb.ts
import { gql } from 'graphql-tag';

export const jambTypeDefs = gql`
  type SubjectQuestions {
    subject: String!
    questions: [Question!]!
  }

  type JambExamSession {
    id: Int!
    subjects: [String!]!
    startTime: DateTime!
    endTime: DateTime
    isCompleted: Boolean!
    scores: [Score!]!
    remainingTime: String!
  }

  type JambExamResult {
    sessionId: Int!
    subjectScores: [Score!]!
    totalScore: Int!
    isCompleted: Boolean!
    timeSpent: String!
  }

  input AnswerInput {
    questionId: String!
    answer: String!
  }

  type Query {
    years: [String!]!
  }

  type Mutation {
    startJambExam(
      subjects: [String!]!
      examYear: String!
    ): JambExamSession!

    finishJambExam(
      sessionId: Int!
      answers: [AnswerInput!]!
    ): JambExamResult!
  }
`;