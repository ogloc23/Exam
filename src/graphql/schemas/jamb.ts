// src/graphql/schemas/jamb.ts
import { gql } from 'graphql-tag';

export const jambTypeDefs = gql`
  type SubjectQuestions {
    subject: String!
    questions: [Question!]!
  }

  type JambExamSession {
    id: Int!
    subjects: [String!]!
    startTime: DateTime!
    endTime: DateTime
    isCompleted: Boolean!
    scores: [Score!]!
    remainingTime: String!
  }

  type JambExamResult {
    sessionId: Int!
    subjectScores: [Score!]!
    totalScore: Int!
    isCompleted: Boolean!
    timeSpent: String!
  }

  type Question {
    id: String!
    question: String!
    options: [String!]!
    answer: String!
    examType: String!
    examSubject: String!
    examYear: String!
  }

  type Score {
    id: Int!
    examType: String!
    examSubject: String!
    subjectId: Int!
    examYear: String!
    score: Int!
    date: DateTime!
  }

  input AnswerInput {
    questionId: String!
    answer: String!
  }

  type Query {
    years: [String!]!
    fetchJambSubjectQuestions(sessionId: Int!): [SubjectQuestions!]!
  }

  type Mutation {
    startJambExam(
      subjects: [String!]!
      examYear: String!
    ): JambExamSession!

    submitAnswer(
      sessionId: Int!
      questionId: String!
      answer: String!
    ): Boolean!

    finishJambExam(
      sessionId: Int!
      answers: [AnswerInput!]
    ): JambExamResult!
  }
`;