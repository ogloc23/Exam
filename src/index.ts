// index.ts
import { ApolloServer } from 'apollo-server';
import { typeDefs, resolvers } from './graphql/merge';

const server = new ApolloServer({
  typeDefs,
  resolvers,
});

const port = process.env.PORT || 4000;

server.listen({ port }).then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});