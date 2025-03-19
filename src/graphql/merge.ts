// Import schemas
import { baseTypeDefs } from './schemas/base';
import { examTypeDefs } from './schemas/exam';
import { fetchTypeDefs } from './schemas/fetch';
import { submitTypeDefs } from './schemas/submit';
import { jambTypeDefs } from './schemas/jamb';

// Import resolvers
import { examResolvers } from './resolvers/exam';
import { fetchResolvers } from './resolvers/fetch';
import { submitResolvers } from './resolvers/submit';
import { jambResolvers } from './resolvers/jamb';

// Combine schemas
export const typeDefs = [
  baseTypeDefs,
  examTypeDefs,
  fetchTypeDefs,
  submitTypeDefs,
  jambTypeDefs,
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
    ...jambResolvers.Query, // Add JAMB query resolvers
  },
  Mutation: {
    ...submitResolvers.Mutation,
    ...jambResolvers.Mutation,
  },
  JambExamSession: jambResolvers.JambExamSession, // 
};