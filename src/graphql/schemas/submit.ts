// src/graphql/schemas/submit.ts
import { gql } from 'graphql-tag';

export const submitTypeDefs = gql`
  type QuestionOption {
    selectedAnswer: String
    isCorrect: Boolean!
    correctAnswer: String!
  }

  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String # Changed from String! to String
    questionOption: QuestionOption
  }

  type SubmitAnswersResponse {
    score: Int!
    total: Int!
    questions: [Question!]!
  }

  input QuestionOptionInput {
    questionId: String!
    selectedAnswer: String!
  }

  type Mutation {
    submitAnswers(
      examType: String!
      examSubject: String!
      examYear: String!
      questionOption: [QuestionOptionInput!]!
    ): SubmitAnswersResponse!
  }
`;