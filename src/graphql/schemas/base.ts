import { gql } from 'apollo-server';

export const baseTypeDefs = gql`
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