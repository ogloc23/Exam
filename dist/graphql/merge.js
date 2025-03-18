"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = exports.typeDefs = void 0;
// Import schemas
const exam_1 = require("./schemas/exam");
const fetch_1 = require("./schemas/fetch");
const submit_1 = require("./schemas/submit");
// Import resolvers
const exam_2 = require("./resolvers/exam");
const fetch_2 = require("./resolvers/fetch");
const submit_2 = require("./resolvers/submit");
// Combine schemas
exports.typeDefs = [
    exam_1.examTypeDefs,
    fetch_1.fetchTypeDefs,
    submit_1.submitTypeDefs,
];
// Combine resolvers
exports.resolvers = {
    Query: Object.assign(Object.assign({}, exam_2.examResolvers.Query), fetch_2.fetchResolvers.Query),
    Mutation: Object.assign({}, submit_2.submitResolvers.Mutation),
};
