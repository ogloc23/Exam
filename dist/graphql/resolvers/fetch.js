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
            var _b, _c, _d, _e;
            const examTypeLower = examType.toLowerCase();
            if (!EXAM_TYPES.includes(examTypeLower)) {
                throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
            }
            if (!YEARS.includes(examYear)) {
                throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
            }
            const dbSubject = examSubject.toLowerCase();
            const apiSubject = dbSubject === 'english language' ? 'english' : dbSubject;
            let subject = yield prisma.subject.findFirst({
                where: { name: dbSubject, examType: examTypeLower },
            });
            if (!subject) {
                console.log(`Subject "${dbSubject}" not found for "${examTypeLower}", creating it.`);
                subject = yield prisma.subject.upsert({
                    where: { name_examType: { name: dbSubject, examType: examTypeLower } },
                    update: {},
                    create: { name: dbSubject, examType: examTypeLower },
                });
            }
            let allQuestions = yield prisma.question.findMany({
                where: { examType: examTypeLower, examSubject: dbSubject, examYear },
            });
            const totalQuestionsTarget = 40;
            if (allQuestions.length >= totalQuestionsTarget) {
                console.log(`Returning ${allQuestions.length} cached questions for ${dbSubject} ${examYear}`);
                const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
                return shuffledQuestions.slice(0, 20);
            }
            const seenIds = new Set(allQuestions.map(q => q.id));
            const batchSize = 20;
            const maxAttemptsPerBatch = 10;
            const batchesNeeded = Math.ceil((totalQuestionsTarget - allQuestions.length) / batchSize);
            for (let batch = 0; batch < batchesNeeded && allQuestions.length < totalQuestionsTarget; batch++) {
                const batchQuestions = [];
                let consecutiveDuplicates = 0;
                const duplicateThreshold = 5;
                for (let i = 0; i < maxAttemptsPerBatch && consecutiveDuplicates < duplicateThreshold && batchQuestions.length < batchSize && allQuestions.length < totalQuestionsTarget; i++) {
                    try {
                        const response = yield apiClient.get('/q', {
                            params: {
                                subject: apiSubject,
                                year: examYear,
                                type: examTypeLower === 'jamb' ? 'utme' : examTypeLower,
                            },
                        });
                        console.log(`API Response for ${dbSubject} (attempt ${i}, batch ${batch + 1}):`, response.data);
                        const questionData = response.data.data && !Array.isArray(response.data.data)
                            ? [response.data.data]
                            : response.data.data || [];
                        if (!questionData.length || !((_b = questionData[0]) === null || _b === void 0 ? void 0 : _b.id) || !((_c = questionData[0]) === null || _c === void 0 ? void 0 : _c.answer)) {
                            console.warn(`Skipping invalid question on attempt ${i}:`, questionData);
                            consecutiveDuplicates++;
                            continue;
                        }
                        const question = questionData[0];
                        const questionId = `${examYear}-${question.id}`;
                        if (seenIds.has(questionId)) {
                            console.log(`Duplicate found: ${questionId}`);
                            consecutiveDuplicates++;
                            continue;
                        }
                        const options = Object.values(question.option || {})
                            .filter((opt) => typeof opt === 'string' && opt !== '')
                            .map(opt => opt);
                        if (options.length < 2) {
                            console.warn(`Skipping ${questionId}: insufficient options (${options.length})`);
                            consecutiveDuplicates++;
                            continue;
                        }
                        const answerIndex = ['a', 'b', 'c', 'd'].indexOf(String(question.answer).toLowerCase());
                        const answerText = answerIndex !== -1 ? options[answerIndex] : question.answer;
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
                        consecutiveDuplicates = 0;
                    }
                    catch (apiError) {
                        console.error(`API call failed on attempt ${i}:`, {
                            message: apiError.message,
                            response: (_d = apiError.response) === null || _d === void 0 ? void 0 : _d.data,
                            status: (_e = apiError.response) === null || _e === void 0 ? void 0 : _e.status,
                        });
                        consecutiveDuplicates++;
                        continue;
                    }
                }
                if (batchQuestions.length > 0) {
                    yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                        yield tx.question.createMany({
                            data: batchQuestions,
                            skipDuplicates: true,
                        });
                        allQuestions = yield tx.question.findMany({
                            where: { examType: examTypeLower, examSubject: dbSubject, examYear },
                        });
                    }), { maxWait: 10000, timeout: 20000 });
                    console.log(`Batch ${batch + 1} completed. Total questions: ${allQuestions.length}`);
                }
            }
            if (allQuestions.length < totalQuestionsTarget) {
                const needed = totalQuestionsTarget - allQuestions.length;
                console.log(`Adding ${needed} mock questions for ${dbSubject}`);
                const mockQuestions = Array.from({ length: needed }, (_, i) => ({
                    id: `${examYear}-mock-${i + 1 + allQuestions.length}`,
                    question: `Mock ${dbSubject} question ${i + 1 + allQuestions.length}`,
                    options: ['a', 'b', 'c', 'd'],
                    answer: 'a',
                    examType: examTypeLower,
                    examSubject: dbSubject,
                    examYear,
                }));
                yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                    yield tx.question.createMany({
                        data: mockQuestions,
                        skipDuplicates: true,
                    });
                    allQuestions = yield tx.question.findMany({
                        where: { examType: examTypeLower, examSubject: dbSubject, examYear },
                    });
                }), { maxWait: 10000, timeout: 20000 });
            }
            console.log(`Fetched and saved ${allQuestions.length} questions for ${dbSubject} ${examYear}`);
            const shuffledQuestions = allQuestions.sort(() => 0.5 - Math.random());
            return shuffledQuestions.slice(0, 20);
        }),
        fetchStudentQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear }) {
            if (!EXAM_TYPES.includes(examType.toLowerCase())) {
                throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
            }
            if (!YEARS.includes(examYear)) {
                throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
            }
            const dbSubject = examSubject.toLowerCase();
            const subject = yield prisma.subject.findFirst({
                where: {
                    name: examSubject,
                    examType: examType.toLowerCase(),
                },
            });
            if (!subject) {
                throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
            }
            const questions = yield prisma.question.findMany({
                where: {
                    examType: examType.toLowerCase(),
                    examSubject: dbSubject,
                    examYear,
                },
            });
            const totalQuestionsToReturn = 20;
            if (questions.length < totalQuestionsToReturn) {
                throw new Error(`Insufficient questions in database: got ${questions.length}, need ${totalQuestionsToReturn}`);
            }
            const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
            return shuffledQuestions.slice(0, totalQuestionsToReturn).map(q => ({
                id: q.id,
                question: q.question,
                options: q.options,
            }));
        }),
        fetchJambSubjectQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId }) {
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
            });
            if (!session) {
                throw new Error(`Session ${sessionId} not found`);
            }
            if (session.isCompleted) {
                throw new Error(`Session ${sessionId} is already completed`);
            }
            const allSubjects = ['english language', 'mathematics', 'physics', 'chemistry'];
            // Verify session subjects match expected
            const invalidSubjects = session.subjects.filter(sub => !allSubjects.includes(sub.toLowerCase()));
            if (invalidSubjects.length > 0) {
                throw new Error(`Session contains invalid subjects: ${invalidSubjects.join(', ')}`);
            }
            const subjectQuestions = yield Promise.all(allSubjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
                const questions = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: subject,
                        examYear: session.examYear,
                    },
                });
                const totalQuestionsToReturn = 20;
                if (questions.length < totalQuestionsToReturn) {
                    throw new Error(`Insufficient questions for ${subject}: got ${questions.length}, need ${totalQuestionsToReturn}`);
                }
                const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
                return {
                    subject,
                    questions: shuffledQuestions.slice(0, totalQuestionsToReturn).map(q => ({
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
