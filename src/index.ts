import 'dotenv/config'; 
import express from 'express';
import { ApolloServer } from 'apollo-server-express';
import cors from 'cors';
import { typeDefs, resolvers } from './graphql/merge'; // Adjusted path case to match your merge file

const app = express();

// Enable CORS
app.use(cors({
  origin: '*',
  credentials: true,
}));

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({
    // Add authentication context here if needed
  }),
});

async function startServer() {
  await server.start();
  server.applyMiddleware({ app: app as any }); // Type assertion to bypass mismatch

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}${server.graphqlPath}`);
  });
}

startServer().catch((error) => {
  console.error('Server failed to start:', error);
});