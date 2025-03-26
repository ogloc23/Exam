"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitTypeDefs = void 0;
// src/graphql/schemas/submit.ts
const graphql_tag_1 = require("graphql-tag");
exports.submitTypeDefs = (0, graphql_tag_1.gql) `
  type QuestionOption {
    selectedAnswer: String
    isCorrect: Boolean!
    correctAnswer: String!
  }

  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String # Changed from String! to String
    questionOption: QuestionOption
  }

  type SubmitAnswersResponse {
    score: Int!
    total: Int!
    questions: [Question!]!
  }

  input QuestionOptionInput {
    questionId: String!
    selectedAnswer: String!
  }

  type Mutation {
    submitAnswers(
      examType: String!
      examSubject: String!
      examYear: String!
      questionOption: [QuestionOptionInput!]!
    ): SubmitAnswersResponse!
  }
`;
