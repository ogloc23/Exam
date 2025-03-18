"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.examTypeDefs = void 0;
const apollo_server_1 = require("apollo-server");
exports.examTypeDefs = (0, apollo_server_1.gql) `
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
