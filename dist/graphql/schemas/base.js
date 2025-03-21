"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseTypeDefs = void 0;
const graphql_tag_1 = require("graphql-tag");
exports.baseTypeDefs = (0, graphql_tag_1.gql) `
  scalar DateTime

  type Score {
    id: Int!
    examType: String!
    examSubject: String!
    subjectId: Int!
    examYear: String!
    score: Int!
    date: DateTime!
  }
`;
