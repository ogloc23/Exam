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
function fetchExternalQuestions(examType_1, examSubject_1, examYear_1) {
    return __awaiter(this, arguments, void 0, function* (examType, examSubject, examYear, targetCount = 20 // Adjusted to 20
    ) {
        var _a, _b;
        const examTypeLower = examType.toLowerCase();
        if (!EXAM_TYPES.includes(examTypeLower))
            throw new Error('Invalid exam type');
        if (!YEARS.includes(examYear))
            throw new Error(`Invalid year`);
        const apiSubject = examSubject === 'english language' ? 'english' : examSubject;
        const dbSubject = examSubject.toLowerCase();
        let allQuestions = [];
        const seenIds = new Set();
        const batchSize = 20;
        const batchesNeeded = Math.ceil(targetCount / batchSize);
        for (let batch = 0; batch < batchesNeeded && allQuestions.length < targetCount; batch++) {
            const batchQuestions = [];
            let consecutiveDuplicates = 0;
            const duplicateThreshold = 5;
            for (let i = 0; i < 10 && consecutiveDuplicates < duplicateThreshold && batchQuestions.length < batchSize && allQuestions.length < targetCount; i++) {
                try {
                    const response = yield apiClient.get('/q', {
                        params: {
                            subject: apiSubject,
                            year: examYear,
                            type: examTypeLower === 'jamb' ? 'utme' : examTypeLower,
                        },
                    });
                    const questionData = response.data.data && !Array.isArray(response.data.data)
                        ? [response.data.data]
                        : response.data.data || [];
                    if (!questionData.length || !((_a = questionData[0]) === null || _a === void 0 ? void 0 : _a.id) || !((_b = questionData[0]) === null || _b === void 0 ? void 0 : _b.answer)) {
                        consecutiveDuplicates++;
                        continue;
                    }
                    const question = questionData[0];
                    const questionId = `${examYear}-${question.id}`;
                    if (seenIds.has(questionId)) {
                        consecutiveDuplicates++;
                        continue;
                    }
                    const options = Object.values(question.option || {})
                        .filter((opt) => typeof opt === 'string' && opt !== '')
                        .map(opt => opt);
                    if (options.length < 2) {
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
                    console.error(`API call failed: ${apiError.message}`);
                    consecutiveDuplicates++;
                }
            }
            allQuestions = allQuestions.concat(batchQuestions);
        }
        return allQuestions.slice(0, targetCount);
    });
}
exports.fetchResolvers = {
    Query: {
        fetchExternalQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear, offset = 0 }) {
            const questions = yield fetchExternalQuestions(examType, examSubject, examYear);
            const batchSize = 20;
            const startIndex = offset * batchSize;
            const endIndex = startIndex + batchSize;
            const result = questions.slice(startIndex, endIndex);
            if (result.length === 0)
                throw new Error(`No more questions at offset ${offset}`);
            return result;
        }),
        fetchStudentQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear }) {
            const dbSubject = examSubject.toLowerCase();
            const questions = yield prisma.question.findMany({
                where: {
                    examType: examType.toLowerCase(),
                    examSubject: dbSubject,
                    examYear,
                },
                take: 20,
            });
            if (questions.length < 20) {
                throw new Error(`Insufficient questions: got ${questions.length}, need 20`);
            }
            return questions.sort(() => 0.5 - Math.random()).map(q => ({
                id: q.id,
                question: q.question,
                options: q.options,
            }));
        }),
        fetchJambSubjectQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId }) {
            const session = yield prisma.jambExamSession.findUnique({ where: { id: sessionId } });
            if (!session)
                throw new Error(`Session ${sessionId} not found`);
            if (session.isCompleted)
                throw new Error(`Session ${sessionId} is completed`);
            const subjectQuestions = yield Promise.all(session.subjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
                // Fetch 20 external questions initially
                const initialExternalQuestions = yield fetchExternalQuestions('jamb', subject, session.examYear, 20);
                console.log(`Initial external questions for ${subject}: ${initialExternalQuestions.length}`);
                // Fetch another 20 external questions
                const additionalExternalQuestions = yield fetchExternalQuestions('jamb', subject, session.examYear, 20);
                console.log(`Additional external questions for ${subject}: ${additionalExternalQuestions.length}`);
                // Combine all 40 external questions
                const allExternalQuestions = [...initialExternalQuestions, ...additionalExternalQuestions];
                console.log(`Total external questions for ${subject}: ${allExternalQuestions.length}`);
                // Save all 40 to database
                yield prisma.question.createMany({
                    data: allExternalQuestions.map(q => ({
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
                // Fetch 20 shuffled questions from the 40 saved
                const dbQuestions = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: subject,
                        examYear: session.examYear,
                    },
                    take: 20,
                });
                const shuffledQuestions = dbQuestions.sort(() => 0.5 - Math.random());
                console.log(`Shuffled questions for ${subject}: ${shuffledQuestions.length}`);
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
