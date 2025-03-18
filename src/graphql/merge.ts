// Import schemas
import { examTypeDefs } from './schemas/exam';
import { fetchTypeDefs } from './schemas/fetch';
import { submitTypeDefs } from './schemas/submit';

// Import resolvers
import { examResolvers } from './resolvers/exam';
import { fetchResolvers } from './resolvers/fetch';
import { submitResolvers } from './resolvers/submit';

// Combine schemas
export const typeDefs = [
  examTypeDefs,
  fetchTypeDefs,
  submitTypeDefs,
];

// Combine resolvers
export const resolvers = {
  Query: {
    ...examResolvers.Query,
    ...fetchResolvers.Query,
  },
  Mutation: {
    ...submitResolvers.Mutation,
  },
};
