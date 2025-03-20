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
            if (!EXAM_TYPES.includes(examType.toLowerCase())) {
                throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
            }
            if (!YEARS.includes(examYear)) {
                throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
            }
            const dbSubject = examSubject.toLowerCase();
            const apiSubject = dbSubject === 'english language' ? 'english' : dbSubject;
            const subject = yield prisma.subject.findFirst({
                where: {
                    name: examSubject,
                    examType: examType.toLowerCase(),
                },
            });
            if (!subject) {
                throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
            }
            // Fetch existing questions
            let allQuestions = yield prisma.question.findMany({
                where: {
                    examType: examType.toLowerCase(),
                    examSubject: dbSubject,
                    examYear,
                },
            });
            const seenIds = new Set(allQuestions.map(q => q.id));
            const totalQuestionsTarget = 40;
            const batchSize = 20;
            const maxAttemptsPerBatch = 30; // Reduced to limit time
            // Fetch batches if needed
            if (allQuestions.length < totalQuestionsTarget) {
                const batchesNeeded = Math.ceil((totalQuestionsTarget - allQuestions.length) / batchSize);
                for (let batch = 0; batch < batchesNeeded && allQuestions.length < totalQuestionsTarget; batch++) {
                    yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                        var _a, _b, _c, _d;
                        let consecutiveDuplicates = 0;
                        const duplicateThreshold = 10;
                        let batchCount = 0;
                        for (let i = 0; i < maxAttemptsPerBatch && consecutiveDuplicates < duplicateThreshold && batchCount < batchSize && allQuestions.length < totalQuestionsTarget; i++) {
                            try {
                                const response = yield apiClient.get('/q', {
                                    params: {
                                        subject: apiSubject,
                                        year: examYear,
                                        type: examType === 'jamb' ? 'utme' : examType,
                                    },
                                });
                                console.log(`API Response for ${examSubject} (attempt ${i}, batch ${batch + 1}):`, response.data);
                                const questionData = response.data.data && !Array.isArray(response.data.data)
                                    ? [response.data.data]
                                    : response.data.data || [];
                                if (!questionData.length || !((_a = questionData[0]) === null || _a === void 0 ? void 0 : _a.id) || !((_b = questionData[0]) === null || _b === void 0 ? void 0 : _b.answer)) {
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
                                    examType: examType.toLowerCase(),
                                    examSubject: dbSubject,
                                    examYear,
                                };
                                const upsertResult = yield tx.question.upsert({
                                    where: { examYear_id: { examYear, id: questionId } },
                                    update: formattedQuestion,
                                    create: formattedQuestion,
                                });
                                console.log(`Successfully upserted ${questionId}`);
                                seenIds.add(questionId);
                                allQuestions.push(formattedQuestion);
                                consecutiveDuplicates = 0;
                                batchCount++;
                            }
                            catch (apiError) {
                                console.error(`API call failed on attempt ${i}:`, {
                                    message: apiError.message,
                                    response: (_c = apiError.response) === null || _c === void 0 ? void 0 : _c.data,
                                    status: (_d = apiError.response) === null || _d === void 0 ? void 0 : _d.status,
                                });
                                consecutiveDuplicates++;
                                continue;
                            }
                        }
                        console.log(`Batch ${batch + 1} completed. Total questions so far: ${allQuestions.length}`);
                    }), { maxWait: 15000, timeout: 30000 }); // Increased timeouts
                }
            }
            // Add mocks if still under 40
            if (allQuestions.length < totalQuestionsTarget) {
                const needed = totalQuestionsTarget - allQuestions.length;
                console.log(`Adding ${needed} mock questions to reach ${totalQuestionsTarget} for ${examSubject}`);
                yield prisma.$transaction((tx) => __awaiter(void 0, void 0, void 0, function* () {
                    const mockQuestions = Array.from({ length: needed }, (_, i) => ({
                        id: `${examYear}-mock-${i + 1 + allQuestions.length}`,
                        question: `Mock ${examSubject} question ${i + 1 + allQuestions.length}`,
                        options: ['a', 'b', 'c', 'd'],
                        answer: 'a',
                        examType: examType.toLowerCase(),
                        examSubject: dbSubject,
                        examYear,
                    }));
                    for (const mock of mockQuestions) {
                        const mockResult = yield tx.question.upsert({
                            where: { examYear_id: { examYear, id: mock.id } },
                            update: mock,
                            create: mock,
                        });
                        allQuestions.push(mockResult);
                    }
                }), { maxWait: 15000, timeout: 30000 });
            }
            // Confirmation log
            console.log(`Success: Fetched and saved ${allQuestions.length} questions for ${examSubject} ${examYear} to the database`);
            // Return first 20
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
                    name: `${examSubject} (${examType.toUpperCase()})`,
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
            const { currentSubject } = session;
            if (!currentSubject) {
                throw new Error(`No current subject set for session ${sessionId}`);
            }
            const examSubject = currentSubject.toLowerCase(); // No (JAMB) to replace
            const questions = yield prisma.question.findMany({
                where: {
                    examType: 'jamb',
                    examSubject,
                    examYear: session.examYear,
                },
            });
            const totalQuestionsToReturn = 20;
            if (questions.length < totalQuestionsToReturn) {
                throw new Error(`Insufficient questions for ${examSubject}: got ${questions.length}, need ${totalQuestionsToReturn}`);
            }
            const shuffledQuestions = questions.sort(() => 0.5 - Math.random());
            return shuffledQuestions.slice(0, totalQuestionsToReturn).map(q => ({
                id: q.id,
                question: q.question,
                options: q.options,
            }));
        }),
    },
};
