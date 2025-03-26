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
// src/resolvers/fetch.ts
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
const apollo_server_express_1 = require("apollo-server-express");
const prisma = new client_1.PrismaClient();
const BASE_API_URL = 'https://questions.aloc.com.ng/api/v2';
const ACCESS_TOKEN = 'QB-385a71b4a2ed9fd0bd27';
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = [
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'
];
const VALID_SUBJECTS = [
    'english language', 'mathematics', 'physics', 'chemistry', 'biology',
    'literature', 'government', 'economics', // Add more JAMB subjects as needed
];
// Mapping for API-specific subject names
const API_SUBJECT_MAP = {
    'english language': 'english',
    // Add more mappings if the API requires different names, e.g., 'mathematics': 'math'
};
const apiClient = axios_1.default.create({
    baseURL: BASE_API_URL,
    headers: {
        'AccessToken': ACCESS_TOKEN,
        'Accept': 'application/json',
    },
});
function fetchExternalQuestions(examType_1, examSubject_1, examYear_1) {
    return __awaiter(this, arguments, void 0, function* (examType, examSubject, examYear, batchSize = 20, totalTarget = 40) {
        const examTypeLower = examType.toLowerCase();
        if (!EXAM_TYPES.includes(examTypeLower))
            throw new apollo_server_express_1.ApolloError('Invalid exam type', 'VALIDATION_ERROR');
        const normalizedSubject = examSubject.toLowerCase().trim();
        if (!YEARS.includes(examYear))
            throw new apollo_server_express_1.ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');
        if (!VALID_SUBJECTS.includes(normalizedSubject)) {
            throw new apollo_server_express_1.ApolloError(`Invalid subject: ${examSubject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
        }
        const apiSubject = API_SUBJECT_MAP[normalizedSubject] || normalizedSubject;
        const dbSubject = normalizedSubject;
        let allQuestions = [];
        const seenIds = new Set();
        const maxAttemptsPerBatch = 30;
        const fetchBatch = (target) => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const batchQuestions = [];
            let attempts = 0;
            while (batchQuestions.length < target && attempts < maxAttemptsPerBatch) {
                try {
                    const response = yield apiClient.get('/q', {
                        params: {
                            subject: apiSubject,
                            year: examYear,
                            type: examTypeLower === 'jamb' ? 'utme' : examTypeLower,
                        },
                    });
                    console.log(`API Response for ${apiSubject} ${examYear}:`, JSON.stringify(response.data, null, 2));
                    const questionData = response.data.data && !Array.isArray(response.data.data)
                        ? [response.data.data]
                        : response.data.data || [];
                    if (!questionData.length || !((_a = questionData[0]) === null || _a === void 0 ? void 0 : _a.id)) {
                        console.warn(`No valid question data for ${apiSubject} ${examYear}: ${JSON.stringify(questionData)}`);
                        attempts++;
                        continue;
                    }
                    const question = questionData[0];
                    const questionId = `${examYear}-${question.id}`;
                    if (seenIds.has(questionId)) {
                        console.log(`Duplicate question ID: ${questionId}`);
                        attempts++;
                        continue;
                    }
                    const options = Object.values(question.option || {})
                        .filter((opt) => typeof opt === 'string' && opt !== '')
                        .map(opt => opt);
                    if (options.length < 2) {
                        console.log(`Insufficient options for ${questionId}: ${options}`);
                        attempts++;
                        continue;
                    }
                    const answerIndex = ['a', 'b', 'c', 'd'].indexOf(String((_b = question.answer) !== null && _b !== void 0 ? _b : '').toLowerCase());
                    const answerText = answerIndex !== -1 ? options[answerIndex] : question.answer || null;
                    const formattedQuestion = {
                        id: questionId,
                        question: question.question || 'No question text provided',
                        options,
                        answer: answerText,
                        examType: examTypeLower,
                        examSubject: dbSubject,
                        examYear,
                    };
                    batchQuestions.push(formattedQuestion);
                    seenIds.add(questionId);
                }
                catch (apiError) {
                    console.error(`API call failed for ${apiSubject} ${examYear}: ${apiError.message}`, (_c = apiError.response) === null || _c === void 0 ? void 0 : _c.data);
                    attempts++;
                }
                attempts++;
            }
            console.log(`Batch completed: ${batchQuestions.length} questions fetched for ${apiSubject} ${examYear}`);
            return batchQuestions;
        });
        const firstBatch = yield fetchBatch(batchSize);
        allQuestions = allQuestions.concat(firstBatch);
        if (allQuestions.length >= batchSize) {
            const secondBatch = yield fetchBatch(batchSize);
            allQuestions = allQuestions.concat(secondBatch);
        }
        else {
            console.warn(`First batch only fetched ${allQuestions.length}, skipping second batch`);
        }
        if (allQuestions.length < totalTarget) {
            throw new apollo_server_express_1.ApolloError(`Only fetched ${allQuestions.length} questions, needed ${totalTarget}`, 'EXTERNAL_API_ERROR', {
                examType,
                examSubject: normalizedSubject,
                examYear,
                fetchedCount: allQuestions.length,
            });
        }
        console.log(`Total fetched: ${allQuestions.length} questions for ${apiSubject} ${examYear}`);
        return allQuestions.slice(0, totalTarget);
    });
}
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
exports.fetchResolvers = {
    Query: {
        fetchExternalQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear }) {
            const questions = yield fetchExternalQuestions(examType, examSubject, examYear);
            yield prisma.question.createMany({
                data: questions.map(q => ({
                    id: q.id,
                    question: q.question,
                    options: q.options,
                    answer: q.answer,
                    examType: q.examType,
                    examSubject: q.examSubject,
                    examYear: q.examYear,
                })),
                skipDuplicates: true,
            });
            return questions.map(q => ({
                id: q.id,
                question: q.question,
                options: q.options,
                answer: q.answer,
            }));
        }),
        fetchStudentQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear }) {
            const dbSubject = examSubject.toLowerCase().trim();
            const questions = yield prisma.question.findMany({
                where: {
                    examType: examType.toLowerCase(),
                    examSubject: dbSubject,
                    examYear,
                },
                take: 20,
            });
            if (questions.length < 20) {
                const additionalQuestions = yield fetchExternalQuestions(examType, examSubject, examYear);
                yield prisma.question.createMany({
                    data: additionalQuestions.map(q => ({
                        id: q.id,
                        question: q.question,
                        options: q.options,
                        answer: q.answer,
                        examType: q.examType,
                        examSubject: q.examSubject,
                        examYear: q.examYear,
                    })),
                    skipDuplicates: true,
                });
                const updatedQuestions = yield prisma.question.findMany({
                    where: {
                        examType: examType.toLowerCase(),
                        examSubject: dbSubject,
                        examYear,
                    },
                    take: 20,
                });
                if (updatedQuestions.length < 20) {
                    throw new apollo_server_express_1.ApolloError(`Insufficient questions: got ${updatedQuestions.length}, need 20`, 'INSUFFICIENT_DATA');
                }
                return shuffleArray(updatedQuestions).map(q => ({
                    id: q.id,
                    question: q.question,
                    options: q.options,
                }));
            }
            return shuffleArray(questions).map(q => ({
                id: q.id,
                question: q.question,
                options: q.options,
            }));
        }),
        fetchJambSubjectQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId }) {
            const session = yield prisma.jambExamSession.findUnique({ where: { id: sessionId } });
            if (!session)
                throw new apollo_server_express_1.ApolloError(`Session ${sessionId} not found`, 'NOT_FOUND');
            if (session.isCompleted)
                throw new apollo_server_express_1.ApolloError(`Session ${sessionId} is completed`, 'INVALID_STATE');
            const subjectQuestions = yield Promise.all(session.subjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
                const existingQuestions = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: subject,
                        examYear: session.examYear,
                    },
                });
                if (existingQuestions.length < 40) {
                    const externalQuestions = yield fetchExternalQuestions('jamb', subject, session.examYear);
                    yield prisma.question.createMany({
                        data: externalQuestions.map(q => ({
                            id: q.id,
                            question: q.question,
                            options: q.options,
                            answer: q.answer,
                            examType: q.examType,
                            examSubject: q.examSubject,
                            examYear: q.examYear,
                        })),
                        skipDuplicates: true,
                    });
                }
                const dbQuestions = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: subject,
                        examYear: session.examYear,
                    },
                    take: 20,
                });
                if (dbQuestions.length < 20) {
                    throw new apollo_server_express_1.ApolloError(`Not enough questions for ${subject}: got ${dbQuestions.length}`, 'INSUFFICIENT_DATA');
                }
                const shuffledQuestions = shuffleArray(dbQuestions);
                return {
                    subject,
                    questions: shuffledQuestions.map(q => ({
                        id: q.id,
                        question: q.question,
                        options: q.options,
                    })),
                };
            })));
            return subjectQuestions;
        }),
    },
};
