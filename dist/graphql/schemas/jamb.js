"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jambTypeDefs = void 0;
const apollo_server_1 = require("apollo-server");
exports.jambTypeDefs = (0, apollo_server_1.gql) `
  scalar DateTime

  type Question {
    id: String!
    question: String!
    options: [String!]!
  }

  type Score {
    id: Int!
    examType: String!
    examSubject: String!
    examYear: String!
    score: Int!
    date: DateTime!
  }

  type JambExamSession {
    id: Int!
    subjects: [String!]!
    currentSubject: String
    startTime: DateTime!
    endTime: DateTime
    isCompleted: Boolean!
    scores: [Score!]!
    remainingTime: String
  }

  type SubmitResponse {
    success: Boolean!
    remainingTime: String
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
    years: [String!]!  # Added this
    fetchJambSubjectQuestions(sessionId: Int!): [Question!]!
  }

  type Mutation {
    startJambExam(
      subjects: [String!]!
      examYear: String!
    ): JambExamSession!

    submitJambAnswer(
      sessionId: Int!
      answers: [AnswerInput!]!
    ): SubmitResponse!

    finishJambExam(
      sessionId: Int!
    ): JambExamResult!
  }
`;
