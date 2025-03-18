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
Object.defineProperty(exports, "__esModule", { value: true });
exports.examResolvers = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011',
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
    '2020', '2021', '2022', '2023'];
exports.examResolvers = {
    Query: {
        examTypes: () => __awaiter(void 0, void 0, void 0, function* () { return EXAM_TYPES; }),
        subjects: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType }) {
            if (!EXAM_TYPES.includes(examType.toLowerCase())) {
                throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
            }
            try {
                const subjects = yield prisma.subject.findMany({
                    where: {
                        examType: examType.toLowerCase(),
                    },
                    select: {
                        id: true,
                        name: true,
                    },
                });
                if (subjects.length === 0) {
                    throw new Error(`No subjects found for exam type "${examType}"`);
                }
                return subjects;
            }
            catch (error) {
                console.error('Error fetching subjects:', error);
                throw new Error('Failed to fetch subjects from database');
            }
        }),
        years: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject }) {
            if (!EXAM_TYPES.includes(examType.toLowerCase())) {
                throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
            }
            try {
                const formattedSubject = `${examSubject} (${examType.toUpperCase()})`;
                console.log(`Looking up subject: "${formattedSubject}" for examType: "${examType}"`); // Debug log
                const subject = yield prisma.subject.findFirst({
                    where: {
                        name: formattedSubject,
                        examType: examType.toLowerCase(),
                    },
                });
                if (!subject) {
                    throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
                }
                return YEARS;
            }
            catch (error) {
                console.error('Error fetching years:', error);
                throw new Error('Failed to fetch years');
            }
        }),
    },
};
