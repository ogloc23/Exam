"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.examTypeDefs = void 0;
const graphql_tag_1 = require("graphql-tag");
exports.examTypeDefs = (0, graphql_tag_1.gql) `
  type Subject {
    id: Int!
    name: String!
  }

  type Query {
    examTypes: [String!]!
    subjects(examType: String!): [Subject!]!
    years(examType: String!, examSubject: String!): [String!]!
  }
`;
