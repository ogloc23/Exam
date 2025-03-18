import { gql } from 'apollo-server';

export const examTypeDefs = gql`
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