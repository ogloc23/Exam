"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTypeDefs = void 0;
const graphql_tag_1 = require("graphql-tag");
exports.fetchTypeDefs = (0, graphql_tag_1.gql) `
  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String!
  }

  type StudentQuestion {
    id: String!
    question: String!
    options: [String!]!
  }

  type Query {
    fetchExternalQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchStudentQuestions(examType: String!, examSubject: String!, examYear: String!): [StudentQuestion!]!
  }
`;
