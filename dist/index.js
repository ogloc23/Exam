"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// index.ts
const apollo_server_1 = require("apollo-server");
const merge_1 = require("./graphql/merge");
const server = new apollo_server_1.ApolloServer({
    typeDefs: merge_1.typeDefs,
    resolvers: merge_1.resolvers,
});
const port = process.env.PORT || 4000;
server.listen({ port }).then(({ url }) => {
    console.log(`🚀 Server ready at ${url}`);
});
