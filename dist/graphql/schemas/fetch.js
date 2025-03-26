"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTypeDefs = void 0;
// src/graphql/schemas/fetch.ts
const graphql_tag_1 = require("graphql-tag");
exports.fetchTypeDefs = (0, graphql_tag_1.gql) `
  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String # Optional, included only in fetchExternalQuestions response
  }

  type SubjectQuestions {
    subject: String!
    questions: [Question!]!
  }

  type Query {
    fetchExternalQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchStudentQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchJambSubjectQuestions(sessionId: Int!): [SubjectQuestions!]!
  }
`;
