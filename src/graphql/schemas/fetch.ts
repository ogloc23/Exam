// src/graphql/schemas/fetch.ts
import { gql } from 'graphql-tag';

export const fetchTypeDefs = gql`
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