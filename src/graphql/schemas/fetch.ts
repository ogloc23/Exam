import { gql } from 'apollo-server';

export const fetchTypeDefs = gql`
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