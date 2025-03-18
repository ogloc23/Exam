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
exports.fetchResolvers = void 0;
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const BASE_API_URL = 'https://questions.aloc.com.ng/api/v2';
const ACCESS_TOKEN = 'QB-385a71b4a2ed9fd0bd27';
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011',
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
    '2020', '2021', '2022', '2023'];
const apiClient = axios_1.default.create({
    baseURL: BASE_API_URL,
    headers: {
        'AccessToken': ACCESS_TOKEN,
        'Accept': 'application/json',
    },
});
exports.fetchResolvers = {
    Query: {
        fetchExternalQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear }) {
            var _b, _c;
            if (!EXAM_TYPES.includes(examType.toLowerCase())) {
                throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
            }
            if (!YEARS.includes(examYear)) {
                throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
            }
            try {
                const subject = yield prisma.subject.findFirst({
                    where: {
                        name: `${examSubject} (${examType.toUpperCase()})`, // Match seeded name
                        examType: examType.toLowerCase(),
                    },
                });
                if (!subject) {
                    throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
                }
                const existingQuestions = yield prisma.question.findMany({
                    where: {
                        examType: examType.toLowerCase(),
                        examSubject: examSubject.toLowerCase(), // Keep lowercase for DB consistency
                        examYear,
                    },
                });
                const seenIds = new Set(existingQuestions.map(q => q.id));
                const allQuestions = [...existingQuestions];
                const totalQuestionsToReturn = 20;
                const maxAttempts = 200;
                let consecutiveDuplicates = 0;
                const duplicateThreshold = 10;
                for (let i = 0; i < maxAttempts && consecutiveDuplicates < duplicateThreshold && allQuestions.length < 40; i++) {
                    try {
                        const response = yield apiClient.get('/q', {
                            params: {
                                subject: examSubject.toLowerCase(),
                                year: examYear,
                                type: examType === 'jamb' ? 'utme' : examType, // Adjust API type based on examType
                            },
                        });
                        const questionData = response.data.data;
                        if (!questionData || !questionData.id || !questionData.answer) {
                            console.warn(`Skipping invalid question on attempt ${i}:`, questionData);
                            continue;
                        }
                        const questionId = `${examYear}-${questionData.id}`;
                        if (seenIds.has(questionId)) {
                            consecutiveDuplicates++;
                            continue;
                        }
                        const options = Object.values(questionData.option)
                            .filter((opt) => typeof opt === 'string' && opt !== null)
                            .map(opt => opt);
                        const question = {
                            id: questionId,
                            question: questionData.question,
                            options,
                            answer: questionData.answer,
                            examType: examType.toLowerCase(),
                            examSubject: examSubject.toLowerCase(),
                            examYear,
                        };
                        yield prisma.question.upsert({
                            where: {
                                examYear_id: {
                                    examYear,
                                    id: questionId,
                                },
                            },
                            update: {},
                            create: question,
                        });
                        seenIds.add(questionId);
                        allQuestions.push(question);
                        consecutiveDuplicates = 0;
                    }
                    catch (apiError) {
                        console.error(`API call failed on attempt ${i}:`, {
                            message: apiError.message,
                            response: (_b = apiError.response) === null || _b === void 0 ? void 0 : _b.data,
                            status: (_c = apiError.response) === null || _c === void 0 ? void 0 : _c.status,
                        });
                        consecutiveDuplicates++;
                        continue;
                    }
                }
                console.log(`Fetched ${allQuestions.length} unique questions for ${examSubject} ${examYear}`);
                if (allQuestions.length < totalQuestionsToReturn) {
                    throw new Error(`Insufficient questions: got ${allQuestions.length}, need ${totalQuestionsToReturn}`);
                }
                const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
                return shuffledQuestions.slice(0, totalQuestionsToReturn);
            }
            catch (error) {
                console.error('Error in fetchExternalQuestions resolver:', error);
                throw new Error(error.message || 'Failed to fetch external questions');
            }
        }),
        fetchStudentQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear }) {
            if (!EXAM_TYPES.includes(examType.toLowerCase())) {
                throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
            }
            if (!YEARS.includes(examYear)) {
                throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
            }
            try {
                const subject = yield prisma.subject.findFirst({
                    where: {
                        name: `${examSubject} (${examType.toUpperCase()})`, // Match seeded name
                        examType: examType.toLowerCase(),
                    },
                });
                if (!subject) {
                    throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
                }
                const questions = yield prisma.question.findMany({
                    where: {
                        examType: examType.toLowerCase(),
                        examSubject: examSubject.toLowerCase(),
                        examYear,
                    },
                });
                const totalQuestionsToReturn = 20;
                if (questions.length < totalQuestionsToReturn) {
                    throw new Error(`Insufficient questions in database: got ${questions.length}, need ${totalQuestionsToReturn}`);
                }
                const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
                const studentQuestions = shuffledQuestions.slice(0, totalQuestionsToReturn).map(q => ({
                    id: q.id,
                    question: q.question,
                    options: q.options,
                }));
                return studentQuestions;
            }
            catch (error) {
                console.error('Error in fetchStudentQuestions resolver:', error);
                throw new Error(error.message || 'Failed to fetch student questions');
            }
        }),
    },
};
