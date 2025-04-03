// src/merge.ts
import { baseTypeDefs } from './schemas/base';
import { examTypeDefs } from './schemas/exam';
import { fetchTypeDefs } from './schemas/fetch';
import { submitTypeDefs } from './schemas/submit';
import { jambTypeDefs } from './schemas/jamb';
import { competitionTypeDefs } from './schemas/competition'; // New import

import { examResolvers } from './resolvers/exam';
import { fetchResolvers } from './resolvers/fetch';
import { submitResolvers } from './resolvers/submit';
import { jambResolvers } from './resolvers/jamb';
import { competitionResolvers } from './resolvers/competition'; // New import

// Combine schemas
export const typeDefs = [
  baseTypeDefs,
  examTypeDefs,
  fetchTypeDefs,
  submitTypeDefs,
  jambTypeDefs,
  competitionTypeDefs, // Add competition schema
];

// Combine resolvers
export const resolvers = {
  DateTime: {
    __serialize: (value: Date) => value.toISOString(),
    __parseValue: (value: string) => new Date(value),
    __parseLiteral: (ast: any) => new Date(ast.value),
  },
  Query: {
    ...examResolvers.Query,
    ...fetchResolvers.Query,
    ...jambResolvers.Query,
    ...competitionResolvers.Query, // Add competition queries
  },
  Mutation: {
    ...submitResolvers.Mutation,
    ...jambResolvers.Mutation,
    ...competitionResolvers.Mutation, // Add competition mutations
  },
  JambExamSession: jambResolvers.JambExamSession, // Keep existing field resolver
};