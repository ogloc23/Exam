"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.baseTypeDefs = void 0;
const apollo_server_1 = require("apollo-server");
exports.baseTypeDefs = (0, apollo_server_1.gql) `
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
