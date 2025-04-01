"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jambTypeDefs = void 0;
// src/graphql/schemas/jamb.ts
const graphql_tag_1 = require("graphql-tag");
exports.jambTypeDefs = (0, graphql_tag_1.gql) `
  type Student {
    id: Int!
    firstName: String!
    lastName: String!
    userName: String!
    email: String
    phoneNumber: String
    studentType: String
    createdAt: String!
    updatedAt: String!
  }

  type LoginResponse {
    success: Boolean!
    message: String!
    token: String!
    student: Student!
  }

  type SubjectQuestions {
    subject: String!
    questions: [Question!]!
  }

  type JambExamSession {
    id: Int!
    subjects: [String!]!
    startTime: String!
    endTime: String
    isCompleted: Boolean!
    scores: [Score!]!
    remainingTime: String!
  }

  type SubjectScore {
    examSubject: String!
    score: Int!
  }

  type JambExamResult {
    sessionId: Int!
    subjectScores: [SubjectScore!]!
    totalScore: Int!
    isCompleted: Boolean!
    timeSpent: String!
  }

  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String
    answerUrl: String
    imageUrl: String
  }

  type Score {
    id: Int!
    examType: String!
    examSubject: String!
    subjectId: Int!
    examYear: String!
    score: Int!
    date: DateTime!
  }

  input StudentInput {
    firstName: String!
    lastName: String!
    userName: String!
    email: String
    phoneNumber: String
    password: String!
    studentType: String
  }

  input LoginInput {
    identifier: String!
    password: String!
  }

  input AnswerInput {
    questionId: String!
    answer: String!
  }

  type Query {
    me: Student!
    years: [String!]!
    fetchExternalQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchStudentQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchJambSubjectQuestions(sessionId: Int!): [SubjectQuestions!]!
  }

  type Mutation {
    registerStudent(input: StudentInput!): Student!
    loginStudent(input: LoginInput!): LoginResponse!
    startJambExam(subjects: [String!]!, examYear: String!): JambExamSession!
    finishJambExam(sessionId: Int!, answers: [AnswerInput!]): JambExamResult!
  }
`;
