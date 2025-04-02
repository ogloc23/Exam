"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
exports.fetchExternalQuestions = fetchExternalQuestions;
exports.fetchMyschoolQuestions = fetchMyschoolQuestions;
exports.fetchAllSubjectsQuestions = fetchAllSubjectsQuestions;
exports.shuffleArray = shuffleArray;
// src/resolvers/fetch.ts
const cloudinary_1 = require("cloudinary");
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const apollo_server_express_1 = require("apollo-server-express");
const client_1 = require("@prisma/client");
// Instantiate Prisma client directly
const prisma = new client_1.PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});
// Configure Cloudinary
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
const BASE_API_URL = 'https://questions.aloc.com.ng/api/v2';
const ACCESS_TOKEN = 'QB-385a71b4a2ed9fd0bd27';
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = [
    '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016',
    '2015', '2014', '2013', '2012', '2011', '2010', '2009', '2008', '2007', '2006', '2005'
];
const VALID_SUBJECTS = [
    'mathematics',
    'english-language',
    'fine-arts',
    'music',
    'french',
    'animal-husbandry',
    'insurance',
    'chemistry',
    'physics',
    'yoruba',
    'biology',
    'geography',
    'literature-in-english',
    'economics',
    'commerce',
    'accounts-principles-of-accounts',
    'government',
    'igbo',
    'christian-religious-knowledge',
    'agricultural-science',
    'islamic-religious-knowledge',
    'history',
    'civic-education',
    'further-mathematics',
    'arabic',
    'home-economics',
    'hausa',
    'book-keeping',
    'data-processing',
    'catering-craft-practice',
    'computer-studies',
    'marketing',
    'physical-education',
    'office-practice',
    'technical-drawing',
    'food-and-nutrition',
    'home-management',
];
// Expanded subject mapping for ALOC and Myschool.ng
const API_SUBJECT_MAP = {
    'english-language': 'english',
    'literature-in-english': 'literature',
    'accounts-principles-of-accounts': 'accounts',
    'christian-religious-knowledge': 'crk',
    'islamic-religious-knowledge': 'irk',
    'agricultural-science': 'agriculture',
    'further-mathematics': 'further-maths',
};
const MY_SCHOOL_SUBJECT_MAP = {
    'english-language': 'english-language',
    'literature-in-english': 'literature-in-english',
    'accounts-principles-of-accounts': 'principles-of-accounts',
    'christian-religious-knowledge': 'christian-religious-studies',
    'islamic-religious-knowledge': 'islamic-studies',
    'agricultural-science': 'agricultural-science',
    'further-mathematics': 'further-mathematics',
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
                    console.log(`ALOC API Response for ${apiSubject} ${examYear}:`, JSON.stringify(response.data, null, 2));
                    const questionData = response.data.data && !Array.isArray(response.data.data)
                        ? [response.data.data]
                        : response.data.data || [];
                    if (!questionData.length || !((_a = questionData[0]) === null || _a === void 0 ? void 0 : _a.id)) {
                        console.warn(`No valid question data for ${apiSubject} ${examYear}`);
                        attempts++;
                        continue;
                    }
                    const question = questionData[0];
                    const questionId = `${examYear}-${question.id}`;
                    if (seenIds.has(questionId)) {
                        attempts++;
                        continue;
                    }
                    const options = Object.values(question.option || {})
                        .filter((opt) => typeof opt === 'string' && opt !== '')
                        .map(opt => opt);
                    if (options.length < 2) {
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
                        answerUrl: undefined,
                        imageUrl: null,
                    };
                    batchQuestions.push(formattedQuestion);
                    seenIds.add(questionId);
                }
                catch (apiError) {
                    console.error(`ALOC API call failed for ${apiSubject} ${examYear}: ${apiError.message}`, (_c = apiError.response) === null || _c === void 0 ? void 0 : _c.data);
                    attempts++;
                }
                attempts++;
            }
            console.log(`ALOC Batch completed: ${batchQuestions.length} questions fetched`);
            return batchQuestions;
        });
        const firstBatch = yield fetchBatch(batchSize);
        allQuestions = allQuestions.concat(firstBatch);
        if (allQuestions.length >= batchSize) {
            const secondBatch = yield fetchBatch(batchSize);
            allQuestions = allQuestions.concat(secondBatch);
        }
        if (allQuestions.length < totalTarget) {
            throw new apollo_server_express_1.ApolloError(`Only fetched ${allQuestions.length} questions from ALOC, needed ${totalTarget}`, 'EXTERNAL_API_ERROR');
        }
        console.log(`Total fetched from ALOC: ${allQuestions.length} questions`);
        return allQuestions.slice(0, totalTarget);
    });
}
function fetchMyschoolQuestions(examType, examSubject, examYear) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const examTypeLower = examType.toLowerCase();
        if (!EXAM_TYPES.includes(examTypeLower))
            throw new apollo_server_express_1.ApolloError('Invalid exam type', 'VALIDATION_ERROR');
        const normalizedSubject = examSubject.toLowerCase().trim();
        if (!YEARS.includes(examYear))
            throw new apollo_server_express_1.ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');
        if (!VALID_SUBJECTS.includes(normalizedSubject)) {
            throw new apollo_server_express_1.ApolloError(`Invalid subject: ${examSubject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
        }
        const dbSubject = normalizedSubject;
        const myschoolSubject = MY_SCHOOL_SUBJECT_MAP[normalizedSubject] || normalizedSubject;
        let allQuestions = [];
        const seenIds = new Set();
        let page = 1;
        const fetchPage = (pageUrl) => __awaiter(this, void 0, void 0, function* () {
            console.log(`Fetching ${examSubject} from URL: ${pageUrl}`);
            try {
                const response = yield axios_1.default.get(pageUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    },
                });
                if (!response.data) {
                    console.error(`No data received from Myschool.ng for ${examSubject}`);
                    throw new Error('Empty response from server');
                }
                const $ = cheerio.load(response.data);
                const questionElements = $('.question-item');
                questionElements.each((i, elem) => {
                    const questionText = $(elem).find('.question-desc p').text().trim();
                    const options = $(elem)
                        .find('ul.list-unstyled li')
                        .map((_, opt) => $(opt).text().trim().replace(/\n\s+/g, ' '))
                        .get();
                    const answerLink = $(elem).find('a.btn-outline-danger').attr('href');
                    const imageUrl = $(elem).find('.media-body div.mb-4 img').attr('src') || $(elem).find('.question-desc img').attr('src') || undefined;
                    if (questionText && options.length >= 2) {
                        const questionId = `${examYear}-${dbSubject}-${page}-${i}`;
                        if (!seenIds.has(questionId)) {
                            allQuestions.push({
                                id: questionId,
                                question: questionText,
                                options,
                                answer: null,
                                answerUrl: answerLink || undefined,
                                examType: examTypeLower,
                                examSubject: dbSubject,
                                examYear,
                                imageUrl: imageUrl ? (imageUrl.startsWith('http') ? imageUrl : `https://myschool.ng${imageUrl}`) : undefined,
                            });
                            seenIds.add(questionId);
                        }
                    }
                });
                console.log(`Scraped ${allQuestions.length} ${examSubject} questions so far from page ${page}`);
                const nextLink = $('.pagination .page-item a[rel="next"]').attr('href');
                if (nextLink) {
                    page++;
                    const nextPageUrl = nextLink.startsWith('http') ? nextLink : `https://myschool.ng${nextLink}`;
                    yield fetchPage(nextPageUrl);
                }
            }
            catch (error) {
                console.error(`Failed to fetch ${examSubject} page ${page}: ${error.message}`);
            }
        });
        const initialUrl = `https://myschool.ng/classroom/${myschoolSubject}?exam_type=jamb&exam_year=${examYear}&type=obj&topic=`;
        yield fetchPage(initialUrl);
        for (const question of allQuestions) {
            if (question.answerUrl) {
                try {
                    const answerResponse = yield axios_1.default.get(question.answerUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                    });
                    const answer$ = cheerio.load(answerResponse.data);
                    const answerElement = answer$('h5.text-success.mb-3').text().trim();
                    let answerText = null;
                    if (answerElement) {
                        const match = answerElement.match(/Correct Answer: Option ([A-D])/i) || answerElement.match(/Answer: ([A-D])/i);
                        if (match && match[1]) {
                            const optionLetter = match[1].toUpperCase();
                            const optionIndex = optionLetter.charCodeAt(0) - 'A'.charCodeAt(0);
                            answerText = ((_a = question.options[optionIndex]) === null || _a === void 0 ? void 0 : _a.trim()) || null;
                        }
                    }
                    question.answer = answerText;
                    console.log(`Fetched answer for ${question.id}: ${answerText}`);
                }
                catch (error) {
                    console.error(`Failed to fetch answer for ${question.id}: ${error.message}`);
                }
            }
            if (question.imageUrl) {
                try {
                    const imageResponse = yield axios_1.default.get(question.imageUrl, { responseType: 'arraybuffer' });
                    const imageBuffer = Buffer.from(imageResponse.data);
                    const uploadResult = yield new Promise((resolve, reject) => {
                        const stream = cloudinary_1.v2.uploader.upload_stream({ public_id: `questions/${question.id}`, folder: 'myschool_scraper' }, (error, result) => (error ? reject(error) : resolve(result)));
                        stream.end(imageBuffer);
                    });
                    question.imageUrl = uploadResult.secure_url;
                    console.log(`Uploaded image for ${question.id}: ${question.imageUrl}`);
                }
                catch (error) {
                    console.error(`Failed to upload image for ${question.id}: ${error.message}`);
                }
            }
            yield new Promise(resolve => setTimeout(resolve, 200));
        }
        try {
            for (const question of allQuestions) {
                yield prisma.question.upsert({
                    where: { id: question.id },
                    update: Object.assign({}, question),
                    create: Object.assign({}, question),
                });
            }
            console.log(`Saved ${allQuestions.length} ${examSubject} questions to database`);
        }
        catch (error) {
            console.error(`Failed to save ${examSubject} questions: ${error.message}`);
        }
        console.log(`Total fetched from Myschool.ng: ${allQuestions.length} questions for ${examSubject}`);
        return allQuestions;
    });
}
function fetchAllSubjectsQuestions(examType, examYear) {
    return __awaiter(this, void 0, void 0, function* () {
        const allSubjectsQuestions = [];
        for (const subject of VALID_SUBJECTS) {
            console.log(`Starting fetch for ${subject} ${examYear}`);
            try {
                const subjectQuestions = yield fetchMyschoolQuestions(examType, subject, examYear);
                allSubjectsQuestions.push({ subject, questions: subjectQuestions });
                console.log(`Completed fetch for ${subject}: ${subjectQuestions.length} questions`);
            }
            catch (error) {
                console.error(`Error fetching ${subject}: ${error.message}`);
            }
            yield new Promise(resolve => setTimeout(resolve, 1000));
        }
        console.log(`Total subjects fetched: ${allSubjectsQuestions.length}`);
        return allSubjectsQuestions;
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
                data: questions,
                skipDuplicates: true,
            });
            return questions;
        }),
        fetchMyschoolQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear }) {
            const questions = yield fetchMyschoolQuestions(examType, examSubject, examYear);
            return questions;
        }),
        fetchAllSubjectsQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examYear }) {
            const subjectQuestions = yield fetchAllSubjectsQuestions(examType, examYear);
            const flatQuestions = subjectQuestions.flatMap(sq => sq.questions);
            return flatQuestions;
        }),
        fetchStudentQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear }) {
            const dbSubject = examSubject.toLowerCase().trim();
            const questionsRaw = yield prisma.question.findMany({
                where: {
                    examType: examType.toLowerCase(),
                    examSubject: dbSubject,
                    examYear,
                },
                take: 20,
            });
            const questions = questionsRaw.map(q => {
                var _a, _b;
                return (Object.assign(Object.assign({}, q), { examType: q.examType, examSubject: q.examSubject, examYear: q.examYear, answerUrl: (_a = q.answerUrl) !== null && _a !== void 0 ? _a : undefined, imageUrl: (_b = q.imageUrl) !== null && _b !== void 0 ? _b : undefined }));
            });
            if (questions.length < 20) {
                const additionalQuestions = yield fetchExternalQuestions(examType, examSubject, examYear);
                yield prisma.question.createMany({
                    data: additionalQuestions,
                    skipDuplicates: true,
                });
                const updatedQuestionsRaw = yield prisma.question.findMany({
                    where: {
                        examType: examType.toLowerCase(),
                        examSubject: dbSubject,
                        examYear,
                    },
                    take: 20,
                });
                const updatedQuestions = updatedQuestionsRaw.map(q => {
                    var _a, _b;
                    return (Object.assign(Object.assign({}, q), { examType: q.examType, examSubject: q.examSubject, examYear: q.examYear, answerUrl: (_a = q.answerUrl) !== null && _a !== void 0 ? _a : undefined, imageUrl: (_b = q.imageUrl) !== null && _b !== void 0 ? _b : undefined }));
                });
                if (updatedQuestions.length < 20) {
                    throw new apollo_server_express_1.ApolloError(`Insufficient questions: got ${updatedQuestions.length}, need 20`, 'INSUFFICIENT_DATA');
                }
                return shuffleArray(updatedQuestions).map(q => ({
                    id: q.id,
                    question: q.question,
                    options: q.options,
                    answerUrl: q.answerUrl,
                    imageUrl: q.imageUrl,
                }));
            }
            return shuffleArray(questions).map(q => ({
                id: q.id,
                question: q.question,
                options: q.options,
                answerUrl: q.answerUrl,
                imageUrl: q.imageUrl,
            }));
        }),
        fetchJambSubjectQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId }) {
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: parseInt(sessionId) }
            });
            if (!session)
                throw new apollo_server_express_1.ApolloError(`Session ${sessionId} not found`, 'NOT_FOUND');
            if (session.isCompleted)
                throw new apollo_server_express_1.ApolloError(`Session ${sessionId} is completed`, 'INVALID_STATE');
            console.log(`Processing session ${sessionId} with subjects: ${session.subjects}, year: ${session.examYear}`);
            if (!YEARS.includes(session.examYear)) {
                throw new apollo_server_express_1.ApolloError(`Invalid exam year: ${session.examYear}. Must be one of: ${YEARS.join(', ')}`, 'VALIDATION_ERROR');
            }
            const examYear = session.examYear;
            const subjectQuestions = yield Promise.all(session.subjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
                console.log(`Original subject from session: ${subject}`);
                const normalizedSubject = subject.replace(/\s+/g, '-').toLowerCase();
                if (!VALID_SUBJECTS.includes(normalizedSubject)) {
                    throw new apollo_server_express_1.ApolloError(`Invalid subject: ${subject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
                }
                console.log(`Normalized subject: ${normalizedSubject}`);
                let existingQuestionsRaw = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: normalizedSubject,
                        examYear: session.examYear,
                    },
                });
                let existingQuestions = existingQuestionsRaw.map(q => {
                    var _a, _b;
                    return (Object.assign(Object.assign({}, q), { examType: q.examType, examSubject: q.examSubject, examYear: q.examYear, answerUrl: (_a = q.answerUrl) !== null && _a !== void 0 ? _a : undefined, imageUrl: (_b = q.imageUrl) !== null && _b !== void 0 ? _b : undefined }));
                });
                console.log(`Existing questions for ${normalizedSubject}: ${existingQuestions.length}`);
                if (existingQuestions.length < 40) {
                    let fetchedQuestions = [];
                    try {
                        fetchedQuestions = yield fetchExternalQuestions('jamb', normalizedSubject, examYear);
                        console.log(`Fetched ${fetchedQuestions.length} questions from ALOC for ${normalizedSubject}`);
                        yield prisma.question.createMany({
                            data: fetchedQuestions,
                            skipDuplicates: true,
                        });
                    }
                    catch (alocError) {
                        console.error(`ALOC fetch failed for ${normalizedSubject}: ${alocError.message}`);
                        try {
                            fetchedQuestions = yield fetchMyschoolQuestions('jamb', normalizedSubject, examYear);
                            console.log(`Fetched ${fetchedQuestions.length} questions from Myschool.ng for ${normalizedSubject}`);
                            yield prisma.question.createMany({
                                data: fetchedQuestions,
                                skipDuplicates: true,
                            });
                        }
                        catch (myschoolError) {
                            console.error(`Myschool fetch failed for ${normalizedSubject}: ${myschoolError.message}`);
                        }
                    }
                    existingQuestionsRaw = yield prisma.question.findMany({
                        where: {
                            examType: 'jamb',
                            examSubject: normalizedSubject,
                            examYear: session.examYear,
                        },
                    });
                    existingQuestions = existingQuestionsRaw.map(q => {
                        var _a, _b;
                        return (Object.assign(Object.assign({}, q), { examType: q.examType, examSubject: q.examSubject, examYear: q.examYear, answerUrl: (_a = q.answerUrl) !== null && _a !== void 0 ? _a : undefined, imageUrl: (_b = q.imageUrl) !== null && _b !== void 0 ? _b : undefined }));
                    });
                    console.log(`Updated questions for ${normalizedSubject} after fetch: ${existingQuestions.length}`);
                }
                const dbQuestionsRaw = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: normalizedSubject,
                        examYear: session.examYear,
                    },
                    take: 20,
                });
                const dbQuestions = dbQuestionsRaw.map(q => {
                    var _a, _b;
                    return (Object.assign(Object.assign({}, q), { examType: q.examType, examSubject: q.examSubject, examYear: q.examYear, answerUrl: (_a = q.answerUrl) !== null && _a !== void 0 ? _a : undefined, imageUrl: (_b = q.imageUrl) !== null && _b !== void 0 ? _b : undefined }));
                });
                console.log(`Final questions fetched for ${normalizedSubject}: ${dbQuestions.length}`);
                if (dbQuestions.length < 20) {
                    throw new apollo_server_express_1.ApolloError(`Not enough questions for ${normalizedSubject}: got ${dbQuestions.length} after fetch attempts`, 'INSUFFICIENT_DATA');
                }
                const shuffledQuestions = shuffleArray(dbQuestions);
                return {
                    subject: normalizedSubject,
                    questions: shuffledQuestions.map(q => ({
                        id: q.id,
                        question: q.question,
                        options: q.options,
                        answerUrl: q.answerUrl,
                        imageUrl: q.imageUrl,
                    })),
                };
            })));
            return subjectQuestions;
        }),
    },
};
