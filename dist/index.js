"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const apollo_server_express_1 = require("apollo-server-express");
const cors_1 = __importDefault(require("cors"));
const merge_1 = require("./graphql/merge"); // Use merged file
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: '*',
    credentials: true,
}));
const server = new apollo_server_express_1.ApolloServer({
    typeDefs: merge_1.typeDefs,
    resolvers: merge_1.resolvers,
    context: ({ req }) => {
        var _a;
        return ({
            token: (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.replace('Bearer ', ''),
        });
    },
});
function startServer() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield server.start();
            server.applyMiddleware({ app: app });
            const PORT = process.env.PORT || 4000;
            app.listen(PORT, () => {
                console.log(`Server running at http://localhost:${PORT}${server.graphqlPath}`);
            });
        }
        catch (error) {
            console.error('Server failed to start:', error);
        }
    });
}
startServer();
