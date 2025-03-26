import 'dotenv/config'; 
import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import { typeDefs, resolvers } from './graphql/merge'; // Use merged file

const app = express();

app.use(cors({
  origin: '*',
  credentials: true,
}));

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({
    token: req.headers.authorization?.replace('Bearer ', ''),
  }),
});

async function startServer() {
  try {
    await server.start();
    server.applyMiddleware({ app: app as any }); 

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}${server.graphqlPath}`);
    });
  } catch (error) {
    console.error('Server failed to start:', error);
  }
}

startServer();