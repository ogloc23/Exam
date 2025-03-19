"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolvers = exports.typeDefs = void 0;
// Import schemas
const base_1 = require("./schemas/base");
const exam_1 = require("./schemas/exam");
const fetch_1 = require("./schemas/fetch");
const submit_1 = require("./schemas/submit");
const jamb_1 = require("./schemas/jamb");
// Import resolvers
const exam_2 = require("./resolvers/exam");
const fetch_2 = require("./resolvers/fetch");
const submit_2 = require("./resolvers/submit");
const jamb_2 = require("./resolvers/jamb");
// Combine schemas
exports.typeDefs = [
    base_1.baseTypeDefs,
    exam_1.examTypeDefs,
    fetch_1.fetchTypeDefs,
    submit_1.submitTypeDefs,
    jamb_1.jambTypeDefs,
];
// Combine resolvers
exports.resolvers = {
    DateTime: {
        __serialize: (value) => value.toISOString(),
        __parseValue: (value) => new Date(value),
        __parseLiteral: (ast) => new Date(ast.value),
    },
    Query: Object.assign(Object.assign(Object.assign({}, exam_2.examResolvers.Query), fetch_2.fetchResolvers.Query), jamb_2.jambResolvers.Query),
    Mutation: Object.assign(Object.assign({}, submit_2.submitResolvers.Mutation), jamb_2.jambResolvers.Mutation),
    JambExamSession: jamb_2.jambResolvers.JambExamSession, // 
};
