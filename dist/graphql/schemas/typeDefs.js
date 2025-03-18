"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.typeDefs = void 0;
const apollo_server_1 = require("apollo-server");
exports.typeDefs = (0, apollo_server_1.gql) `
  type Subject {
    id: Int!
    name: String!
  }

  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String!
    questionOption: QuestionOption  # Only included in submitAnswers response
  }

  type StudentQuestion {
    id: String!
    question: String!
    options: [String!]!
  }

  type QuestionOption {
    selectedAnswer: String  # Student's choice
    isCorrect: Boolean!     # Whether it's correct
    correctAnswer: String!  # The right answer for feedback
  }

  type SubmitAnswersResponse {
    score: Int!
    total: Int!
    questions: [Question!]!  # Returns full questions with questionOption
  }

  type Query {
    examTypes: [String!]!
    subjects(examType: String!): [Subject!]!
    years(examType: String!, examSubject: String!): [String!]!
    fetchExternalQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchStudentQuestions(examType: String!, examSubject: String!, examYear: String!): [StudentQuestion!]!
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
