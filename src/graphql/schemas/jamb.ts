// src/graphql/schemas/jamb.ts
import { gql } from 'graphql-tag';

export const jambTypeDefs = gql`
  scalar DateTime

  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String
  }

  type Score {
    id: Int!
    examType: String!
    examSubject: String!
    examYear: String!
    score: Int!
    date: DateTime!
  }

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