"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTypeDefs = void 0;
const graphql_tag_1 = require("graphql-tag");
exports.fetchTypeDefs = (0, graphql_tag_1.gql) `
  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String
    answerUrl: String
    imageUrl: String
    examSubject: String # Added to identify subject in fetchAllSubjectsQuestions
  }

  type SubjectQuestions {
    subject: String!
    questions: [Question!]!
  }

  type Query {
    fetchExternalQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchMyschoolQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchStudentQuestions(examType: String!, examSubject: String!, examYear: String!): [Question!]!
    fetchJambSubjectQuestions(sessionId: Int!): [SubjectQuestions!]!
    fetchAllSubjectsQuestions(examType: String!, examYear: String!): [Question!]! # New query
  }
`;
