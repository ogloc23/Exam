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
exports.jambResolvers = void 0;
// src/graphql/resolvers/jamb.ts
const client_1 = require("@prisma/client");
const bcryptjs_1 = require("bcryptjs");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const apollo_server_express_1 = require("apollo-server-express");
const fetch_1 = require("./fetch"); // Adjust path as needed
const prisma = new client_1.PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
});
const JAMB_TIME_LIMIT = 5400 * 1000; // 90 minutes in milliseconds
const YEARS = [
    '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016',
    '2015', '2014', '2013', '2012', '2011', '2010', '2009', '2008', '2007', '2006', '2005'
];
const authMiddleware = (context) => {
    const token = context.token;
    if (!token)
        throw new apollo_server_express_1.ApolloError('No token provided', 'UNAUTHENTICATED');
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        return decoded.id;
    }
    catch (error) {
        throw new apollo_server_express_1.ApolloError('Invalid or expired token', 'UNAUTHENTICATED');
    }
};
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
function normalizeSubject(subject) {
    return subject.trim().toLowerCase().replace(/\s+/g, '-');
}
function formatSubjectForFrontend(subject) {
    const parts = subject.split('-');
    return parts.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}
exports.jambResolvers = {
    Query: {
        years: () => YEARS,
        subjects: () => __awaiter(void 0, void 0, void 0, function* () {
            const subjects = yield prisma.subject.findMany({
                where: { examType: 'jamb' },
            });
            return subjects.map(subject => ({
                id: subject.id,
                name: formatSubjectForFrontend(subject.name),
            }));
        }),
        fetchJambSubjectQuestions: (_1, _a, context_1) => __awaiter(void 0, [_1, _a, context_1], void 0, function* (_, { sessionId }, context) {
            const studentId = authMiddleware(context);
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
                select: { id: true, studentId: true, subjects: true, examYear: true, isCompleted: true }
            });
            if (!session)
                throw new apollo_server_express_1.ApolloError('Session not found', 'NOT_FOUND');
            if (session.studentId !== studentId)
                throw new apollo_server_express_1.ApolloError('Unauthorized access to session', 'FORBIDDEN');
            if (session.isCompleted)
                throw new apollo_server_express_1.ApolloError('Session already completed', 'INVALID_STATE');
            console.log(`Processing session ${sessionId} with subjects: ${session.subjects}, year: ${session.examYear}`);
            if (!YEARS.includes(session.examYear)) {
                throw new apollo_server_express_1.ApolloError(`Invalid exam year: ${session.examYear}. Must be one of: ${YEARS.join(', ')}`, 'VALIDATION_ERROR');
            }
            const examYear = session.examYear;
            if (session.subjects.length !== 4) {
                throw new apollo_server_express_1.ApolloError(`Exactly 4 subjects required, got ${session.subjects.length}`, 'VALIDATION_ERROR');
            }
            const VALID_SUBJECTS = [
                'mathematics', 'english-language', 'fine-arts', 'music', 'french', 'animal-husbandry', 'insurance', 'chemistry',
                'physics', 'yoruba', 'biology', 'geography', 'literature-in-english', 'economics', 'commerce',
                'accounts-principles-of-accounts', 'government', 'igbo', 'christian-religious-knowledge', 'agricultural-science',
                'islamic-religious-knowledge', 'history', 'civic-education', 'further-mathematics', 'arabic', 'home-economics',
                'hausa', 'book-keeping', 'data-processing', 'catering-craft-practice', 'computer-studies', 'marketing',
                'physical-education', 'office-practice', 'technical-drawing', 'food-and-nutrition', 'home-management'
            ];
            const subjectQuestions = yield Promise.all(session.subjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
                const normalizedSubject = normalizeSubject(subject);
                if (!VALID_SUBJECTS.includes(normalizedSubject)) {
                    throw new apollo_server_express_1.ApolloError(`Invalid subject: ${subject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
                }
                console.log(`Processing subject: ${normalizedSubject}`);
                const targetQuestions = normalizedSubject === 'english-language' ? 60 : 40;
                // Step 1: Fetch questions for the specific year first
                let validQuestions = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: normalizedSubject,
                        examYear,
                        answer: { not: null },
                    },
                    take: targetQuestions,
                }).then(questions => questions.filter(q => {
                    const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                    const requiresImage = q.question.toLowerCase().includes('diagram') ||
                        q.question.toLowerCase().includes('figure') ||
                        q.question.toLowerCase().includes('image');
                    const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                    return hasValidOptions && hasImageIfRequired;
                }));
                console.log(`Valid questions for ${normalizedSubject} in ${examYear}: ${validQuestions.length}`);
                // Step 2: Quickly fill gaps with other years if needed
                if (validQuestions.length < targetQuestions) {
                    console.log(`Insufficient questions (${validQuestions.length}/${targetQuestions}) for ${examYear}, fetching from other years...`);
                    const remainingNeeded = targetQuestions - validQuestions.length;
                    const otherYearsQuestions = yield prisma.question.findMany({
                        where: {
                            examType: 'jamb',
                            examSubject: normalizedSubject,
                            examYear: { not: examYear },
                        },
                        take: remainingNeeded,
                    }).then(questions => questions.filter(q => {
                        const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                        const requiresImage = q.question.toLowerCase().includes('diagram') ||
                            q.question.toLowerCase().includes('figure') ||
                            q.question.toLowerCase().includes('image');
                        const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                        return hasValidOptions && hasImageIfRequired;
                    }));
                    validQuestions = [
                        ...validQuestions,
                        ...otherYearsQuestions.filter(q => !validQuestions.some(vq => vq.id === q.id)),
                    ].slice(0, targetQuestions);
                    console.log(`After adding from other years: ${validQuestions.length}`);
                }
                // Step 3: Fetch from Myschool.ng only if still insufficient
                if (validQuestions.length < targetQuestions) {
                    console.log(`Still insufficient (${validQuestions.length}/${targetQuestions}), fetching from Myschool.ng...`);
                    try {
                        const fetchedQuestions = yield (0, fetch_1.fetchMyschoolQuestions)('jamb', normalizedSubject, examYear);
                        const neededQuestions = fetchedQuestions.slice(0, targetQuestions - validQuestions.length);
                        console.log(`Fetched ${neededQuestions.length} questions from Myschool.ng for ${normalizedSubject}`);
                        yield prisma.question.createMany({
                            data: neededQuestions,
                            skipDuplicates: true,
                        });
                        const newQuestions = yield prisma.question.findMany({
                            where: {
                                examType: 'jamb',
                                examSubject: normalizedSubject,
                                examYear,
                            },
                            take: targetQuestions - validQuestions.length,
                        }).then(questions => questions.filter(q => {
                            const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                            const requiresImage = q.question.toLowerCase().includes('diagram') ||
                                q.question.toLowerCase().includes('figure') ||
                                q.question.toLowerCase().includes('image');
                            const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                            return hasValidOptions && hasImageIfRequired;
                        }));
                        validQuestions = [
                            ...validQuestions,
                            ...newQuestions.filter(q => !validQuestions.some(vq => vq.id === q.id)),
                        ].slice(0, targetQuestions);
                        console.log(`After Myschool fetch: ${validQuestions.length}`);
                    }
                    catch (myschoolError) {
                        console.error(`Myschool fetch failed for ${normalizedSubject}: ${myschoolError.message}`);
                    }
                }
                // Step 4: Finalize with exact count
                const finalQuestions = shuffleArray(validQuestions).slice(0, targetQuestions);
                if (finalQuestions.length < targetQuestions) {
                    console.warn(`Warning: Only ${finalQuestions.length}/${targetQuestions} questions available for ${normalizedSubject}`);
                }
                console.log(`Final questions for ${normalizedSubject}: ${finalQuestions.length}`);
                return {
                    subject: formatSubjectForFrontend(normalizedSubject),
                    questions: finalQuestions.map(q => {
                        var _a, _b;
                        return ({
                            id: q.id,
                            question: q.question,
                            options: q.options,
                            answer: (_a = q.answer) !== null && _a !== void 0 ? _a : undefined,
                            imageUrl: (_b = q.imageUrl) !== null && _b !== void 0 ? _b : undefined,
                        });
                    }),
                };
            })));
            console.log(`Total questions selected for session: ${subjectQuestions.reduce((sum, sq) => sum + sq.questions.length, 0)}`);
            return subjectQuestions;
        }),
        fetchJambCompetitionQuestions: (_1, _a, context_1) => __awaiter(void 0, [_1, _a, context_1], void 0, function* (_, { sessionId }, context) {
            const studentId = authMiddleware(context);
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
                select: { id: true, studentId: true, subjects: true, examYear: true, isCompleted: true }
            });
            if (!session)
                throw new apollo_server_express_1.ApolloError('Session not found', 'NOT_FOUND');
            if (session.studentId !== studentId)
                throw new apollo_server_express_1.ApolloError('Unauthorized access to session', 'FORBIDDEN');
            if (session.isCompleted)
                throw new apollo_server_express_1.ApolloError('Session already completed', 'INVALID_STATE');
            console.log(`Processing session ${sessionId} with subjects: ${session.subjects}, year: ${session.examYear}`);
            if (!YEARS.includes(session.examYear)) {
                throw new apollo_server_express_1.ApolloError(`Invalid exam year: ${session.examYear}. Must be one of: ${YEARS.join(', ')}`, 'VALIDATION_ERROR');
            }
            const examYear = session.examYear;
            if (session.subjects.length !== 4) {
                throw new apollo_server_express_1.ApolloError(`Exactly 4 subjects required, got ${session.subjects.length}`, 'VALIDATION_ERROR');
            }
            const VALID_SUBJECTS = [
                'mathematics', 'english-language', 'fine-arts', 'music', 'french', 'animal-husbandry', 'insurance', 'chemistry',
                'physics', 'yoruba', 'biology', 'geography', 'literature-in-english', 'economics', 'commerce',
                'accounts-principles-of-accounts', 'government', 'igbo', 'christian-religious-knowledge', 'agricultural-science',
                'islamic-religious-knowledge', 'history', 'civic-education', 'further-mathematics', 'arabic', 'home-economics',
                'hausa', 'book-keeping', 'data-processing', 'catering-craft-practice', 'computer-studies', 'marketing',
                'physical-education', 'office-practice', 'technical-drawing', 'food-and-nutrition', 'home-management'
            ];
            const subjectQuestions = yield Promise.all(session.subjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
                const normalizedSubject = normalizeSubject(subject);
                if (!VALID_SUBJECTS.includes(normalizedSubject)) {
                    throw new apollo_server_express_1.ApolloError(`Invalid subject: ${subject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
                }
                console.log(`Processing subject: ${normalizedSubject}`);
                const targetQuestions = normalizedSubject === 'english-language' ? 60 : 40;
                // Step 1: Fetch random questions using raw SQL
                const rawQuestions = yield prisma.$queryRaw `
              SELECT * FROM "Question" 
              WHERE "examType" = 'jamb' 
              AND "examSubject" = ${normalizedSubject}
              AND "answer" IS NOT NULL
              ORDER BY RANDOM() 
              LIMIT ${targetQuestions};
            `;
                // Cast and validate the raw query results
                let validQuestions = rawQuestions.filter(q => {
                    const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                    const requiresImage = q.question.toLowerCase().includes('diagram') ||
                        q.question.toLowerCase().includes('figure') ||
                        q.question.toLowerCase().includes('image');
                    const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                    return hasValidOptions && hasImageIfRequired;
                });
                console.log(`Valid random questions for ${normalizedSubject}: ${validQuestions.length}`);
                // Step 3: Fetch from Myschool.ng only if still insufficient
                if (validQuestions.length < targetQuestions) {
                    console.log(`Still insufficient (${validQuestions.length}/${targetQuestions}), fetching from Myschool.ng...`);
                    try {
                        const fetchedQuestions = yield (0, fetch_1.fetchMyschoolQuestions)('jamb', normalizedSubject, examYear);
                        const neededQuestions = fetchedQuestions.slice(0, targetQuestions - validQuestions.length);
                        console.log(`Fetched ${neededQuestions.length} questions from Myschool.ng for ${normalizedSubject}`);
                        yield prisma.question.createMany({
                            data: neededQuestions,
                            skipDuplicates: true,
                        });
                        const newQuestions = yield prisma.question.findMany({
                            where: {
                                examType: 'jamb',
                                examSubject: normalizedSubject,
                                examYear,
                            },
                            take: targetQuestions - validQuestions.length,
                        }).then(questions => questions.filter(q => {
                            const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                            const requiresImage = q.question.toLowerCase().includes('diagram') ||
                                q.question.toLowerCase().includes('figure') ||
                                q.question.toLowerCase().includes('image');
                            const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                            return hasValidOptions && hasImageIfRequired;
                        }));
                        validQuestions = [
                            ...validQuestions,
                            ...newQuestions.filter(q => !validQuestions.some(vq => vq.id === q.id)),
                        ].slice(0, targetQuestions);
                        console.log(`After Myschool fetch: ${validQuestions.length}`);
                    }
                    catch (myschoolError) {
                        console.error(`Myschool fetch failed for ${normalizedSubject}: ${myschoolError.message}`);
                    }
                }
                // Step 4: Finalize with exact count
                const finalQuestions = shuffleArray(validQuestions).slice(0, targetQuestions);
                if (finalQuestions.length < targetQuestions) {
                    console.warn(`Warning: Only ${finalQuestions.length}/${targetQuestions} questions available for ${normalizedSubject}`);
                }
                console.log(`Final questions for ${normalizedSubject}: ${finalQuestions.length}`);
                return {
                    subject: formatSubjectForFrontend(normalizedSubject),
                    questions: finalQuestions.map((q) => {
                        var _a, _b;
                        console.log(q.id);
                        return {
                            id: q.id,
                            question: q.question,
                            options: q.options,
                            answer: (_a = q.answer) !== null && _a !== void 0 ? _a : undefined,
                            imageUrl: (_b = q.imageUrl) !== null && _b !== void 0 ? _b : undefined,
                        };
                    }),
                };
            })));
            console.log(`Total questions selected for session: ${subjectQuestions.reduce((sum, sq) => sum + sq.questions.length, 0)}`);
            return subjectQuestions;
        }),
        me: (_, __, context) => __awaiter(void 0, void 0, void 0, function* () {
            const studentId = authMiddleware(context);
            const student = yield prisma.student.findUnique({
                where: { id: studentId },
            });
            if (!student) {
                throw new apollo_server_express_1.ApolloError('Student not found', 'NOT_FOUND');
            }
            return Object.assign(Object.assign({}, student), { createdAt: student.createdAt.toISOString(), updatedAt: student.updatedAt.toISOString() });
        }),
    },
    Mutation: {
        registerStudent: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { input }) {
            try {
                const { firstName, lastName, userName, email, phoneNumber, password, studentType } = input;
                if (!firstName || !lastName || !userName || !password) {
                    throw new apollo_server_express_1.ApolloError('First name, last name, username, and password are required', 'VALIDATION_ERROR', {
                        missingFields: Object.keys({ firstName, lastName, userName, password }).filter(key => !input[key]),
                    });
                }
                if (email && (!email.includes('@') || !email.includes('.'))) {
                    throw new apollo_server_express_1.ApolloError('Invalid email format', 'VALIDATION_ERROR', { field: 'email' });
                }
                if (phoneNumber) {
                    const phoneDigits = phoneNumber.replace(/\D/g, '');
                    if (phoneDigits.length !== 11) {
                        throw new apollo_server_express_1.ApolloError('Phone number must be exactly 11 digits', 'VALIDATION_ERROR', {
                            field: 'phoneNumber',
                            receivedLength: phoneDigits.length,
                        });
                    }
                }
                if (password.length < 8) {
                    throw new apollo_server_express_1.ApolloError('Password must be at least 8 characters', 'VALIDATION_ERROR', { field: 'password' });
                }
                if (studentType && !['SCIENCE', 'ART'].includes(studentType)) {
                    throw new apollo_server_express_1.ApolloError('Invalid student type', 'VALIDATION_ERROR', { field: 'studentType' });
                }
                const existingStudent = yield prisma.student.findFirst({
                    where: { OR: [{ userName }, ...(email ? [{ email }] : [])] },
                });
                if (existingStudent) {
                    if (existingStudent.userName === userName && email && existingStudent.email === email) {
                        throw new apollo_server_express_1.ApolloError('Username and email already exist', 'DUPLICATE_USER', { fields: ['userName', 'email'] });
                    }
                    else if (existingStudent.userName === userName) {
                        throw new apollo_server_express_1.ApolloError('Username already exists', 'DUPLICATE_USER', { field: 'userName' });
                    }
                    else if (email && existingStudent.email === email) {
                        throw new apollo_server_express_1.ApolloError('Email already exists', 'DUPLICATE_USER', { field: 'email' });
                    }
                }
                const hashedPassword = yield (0, bcryptjs_1.hash)(password, 10);
                const student = yield prisma.student.create({
                    data: {
                        firstName,
                        lastName,
                        userName,
                        email: email || null,
                        phoneNumber: phoneNumber || null,
                        password: hashedPassword,
                        studentType,
                    },
                });
                return Object.assign(Object.assign({}, student), { createdAt: student.createdAt.toISOString(), updatedAt: student.updatedAt.toISOString() });
            }
            catch (error) {
                if (error instanceof apollo_server_express_1.ApolloError)
                    throw error;
                const err = error;
                throw new apollo_server_express_1.ApolloError('Registration failed', 'INTERNAL_SERVER_ERROR', { originalError: err.message });
            }
        }),
        loginStudent: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { input }) {
            try {
                const { identifier, password } = input;
                if (!identifier || !password) {
                    throw new apollo_server_express_1.ApolloError('Identifier and password are required', 'VALIDATION_ERROR', {
                        missingFields: Object.keys(input).filter(key => !input[key]),
                    });
                }
                const student = yield prisma.student.findFirst({
                    where: { OR: [{ userName: identifier }, { email: identifier }] },
                });
                if (!student) {
                    throw new apollo_server_express_1.ApolloError('Invalid credentials', 'AUTHENTICATION_FAILED');
                }
                const isPasswordValid = yield (0, bcryptjs_1.compare)(password, student.password);
                if (!isPasswordValid) {
                    throw new apollo_server_express_1.ApolloError('Invalid credentials', 'AUTHENTICATION_FAILED');
                }
                const token = jsonwebtoken_1.default.sign({ id: student.id, userName: student.userName }, process.env.JWT_SECRET || 'your-secret-key');
                return {
                    success: true,
                    message: 'Login successful',
                    token,
                    student: Object.assign(Object.assign({}, student), { createdAt: student.createdAt.toISOString(), updatedAt: student.updatedAt.toISOString() }),
                };
            }
            catch (error) {
                if (error instanceof apollo_server_express_1.ApolloError)
                    throw error;
                const err = error;
                throw new apollo_server_express_1.ApolloError('Login failed', 'INTERNAL_SERVER_ERROR', { originalError: err.message });
            }
        }),
        startJambExam: (_1, _a, context_1) => __awaiter(void 0, [_1, _a, context_1], void 0, function* (_, { subjects, examYear, isCompetition }, context) {
            var _b;
            const studentId = authMiddleware(context);
            const normalizedSubjects = subjects.map(normalizeSubject);
            const uniqueSubjects = new Set(normalizedSubjects);
            if (uniqueSubjects.size !== 4)
                throw new apollo_server_express_1.ApolloError('Exactly 4 unique subjects required', 'VALIDATION_ERROR');
            if (!uniqueSubjects.has('english-language'))
                throw new apollo_server_express_1.ApolloError('English Language is compulsory', 'VALIDATION_ERROR');
            if (!isCompetition && !YEARS.includes(examYear))
                throw new apollo_server_express_1.ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');
            const VALID_SUBJECTS = [
                'mathematics', 'english-language', 'fine-arts', 'music', 'french', 'animal-husbandry', 'insurance', 'chemistry',
                'physics', 'yoruba', 'biology', 'geography', 'literature-in-english', 'economics', 'commerce',
                'accounts-principles-of-accounts', 'government', 'igbo', 'christian-religious-knowledge', 'agricultural-science',
                'islamic-religious-knowledge', 'history', 'civic-education', 'further-mathematics', 'arabic', 'home-economics',
                'hausa', 'book-keeping', 'data-processing', 'catering-craft-practice', 'computer-studies', 'marketing',
                'physical-education', 'office-practice', 'technical-drawing', 'food-and-nutrition', 'home-management'
            ];
            const invalidSubjects = Array.from(uniqueSubjects).filter(sub => !VALID_SUBJECTS.includes(sub));
            if (invalidSubjects.length > 0)
                throw new apollo_server_express_1.ApolloError(`Invalid subjects: ${invalidSubjects.join(', ')}`, 'VALIDATION_ERROR');
            const newSession = yield prisma.jambExamSession.create({
                data: {
                    subjects: Array.from(uniqueSubjects),
                    examYear: examYear ? examYear : String(new Date().getFullYear()),
                    startTime: new Date(),
                    isCompleted: false,
                    studentId,
                    isCompetition: isCompetition ? isCompetition : false
                },
            });
            return {
                id: newSession.id,
                subjects: newSession.subjects.map(formatSubjectForFrontend),
                startTime: newSession.startTime.toISOString(),
                endTime: ((_b = newSession.endTime) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
                isCompleted: newSession.isCompleted,
                scores: [],
                remainingTime: '90min 0s',
            };
        }),
        finishJambExam: (_1, _a, context_1) => __awaiter(void 0, [_1, _a, context_1], void 0, function* (_, { sessionId, answers, questionIds }, context) {
            const studentId = authMiddleware(context);
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
                include: { answers: true },
            });
            if (!session)
                throw new apollo_server_express_1.ApolloError('Session not found', 'NOT_FOUND');
            if (session.studentId !== studentId)
                throw new apollo_server_express_1.ApolloError('Unauthorized access to session', 'FORBIDDEN');
            // if (session.isCompleted) throw new ApolloError('JAMB session already completed', 'INVALID_STATE');
            const allSubjects = session.subjects.map(normalizeSubject);
            const targetCounts = allSubjects.map(subject => ({
                subject,
                count: subject === 'english-language' ? 60 : 40,
            }));
            // Fetch questions used in this session (based on what fetchJambSubjectQuestions would return)
            const questionsBySubject = yield Promise.all(targetCounts.map((_a) => __awaiter(void 0, [_a], void 0, function* ({ subject, count }) {
                let questions = yield prisma.question.findMany({
                    where: { examType: 'jamb', examSubject: subject, examYear: session.examYear },
                    take: count,
                }).then(qs => qs.filter(q => {
                    const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                    const requiresImage = q.question.toLowerCase().includes('diagram') ||
                        q.question.toLowerCase().includes('figure') ||
                        q.question.toLowerCase().includes('image');
                    const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                    return hasValidOptions && hasImageIfRequired;
                }));
                if (questions.length < count) {
                    const additionalQuestions = yield prisma.question.findMany({
                        where: { examType: 'jamb', examSubject: subject, examYear: { not: session.examYear } },
                        take: count - questions.length,
                    }).then(qs => qs.filter(q => {
                        const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                        const requiresImage = q.question.toLowerCase().includes('diagram') ||
                            q.question.toLowerCase().includes('figure') ||
                            q.question.toLowerCase().includes('image');
                        const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                        return hasValidOptions && hasImageIfRequired;
                    }));
                    questions = [...questions, ...additionalQuestions].slice(0, count);
                }
                return { subject, questions };
            })));
            const questionMap = new Map();
            questionsBySubject.forEach(({ questions }) => {
                questions.forEach(q => questionMap.set(q.id, { answer: q.answer, options: q.options }));
            });
            // Store or update answers
            if (answers && answers.length > 0) {
                yield prisma.$transaction(answers.map(({ questionId, answer }) => prisma.answer.upsert({
                    where: { sessionId_questionId: { sessionId, questionId } },
                    update: { answer },
                    create: { sessionId, questionId, answer },
                })));
            }
            // Fetch all answers for scoring
            const sessionAnswers = yield prisma.answer.findMany({
                where: { sessionId },
            });
            const answerMap = new Map();
            sessionAnswers.forEach(a => answerMap.set(a.questionId, a.answer));
            // Calculate scores
            const subjectScores = questionsBySubject.map(({ subject, questions }) => {
                const correctAnswers = questions.reduce((acc, q) => {
                    const submittedAnswer = answerMap.get(q.id);
                    if (!submittedAnswer)
                        return acc; // No answer submitted, no points
                    const correctAnswer = q.answer;
                    if (!correctAnswer)
                        return acc; // No correct answer defined, no points
                    // Handle both letter-based (a, b, c, d) and text-based answers
                    const submittedOptionText = ['a', 'b', 'c', 'd'].includes(submittedAnswer.toLowerCase())
                        ? q.options[['a', 'b', 'c', 'd'].indexOf(submittedAnswer.toLowerCase())] || submittedAnswer
                        : submittedAnswer;
                    return acc + (submittedOptionText === correctAnswer ? 1 : 0);
                }, 0);
                return { subject, correctAnswers, questionCount: questions.length };
            });
            // Calculate the total number of questions across all subjects
            const totalQuestions = subjectScores.reduce((acc, { questionCount }) => acc + questionCount, 0);
            const totalCorrectAnswers = subjectScores.reduce((acc, { correctAnswers }) => acc + correctAnswers, 0);
            // Scale the score to a maximum of 400 points
            const scaledTotalScore = Math.round((totalCorrectAnswers / totalQuestions) * 400);
            // Calculate scaled scores for each subject
            const scaledSubjectScores = subjectScores.map(({ subject, correctAnswers, questionCount }) => {
                // Each subject's score is scaled proportionally to maintain the 400 total
                const maxSubjectScore = Math.round((questionCount / totalQuestions) * 400);
                const scaledScore = Math.round((correctAnswers / questionCount) * maxSubjectScore);
                return { subject, score: scaledScore, questionCount };
            });
            // Update scores in the database
            const subjectRecords = yield prisma.subject.findMany({
                where: { name: { in: allSubjects }, examType: 'jamb' },
            });
            const subjectMap = new Map(subjectRecords.map(s => [normalizeSubject(s.name), s.id]));
            const missingSubjects = allSubjects.filter(subject => !subjectMap.has(subject));
            if (missingSubjects.length > 0) {
                const newSubjects = yield prisma.$transaction(missingSubjects.map(subject => prisma.subject.upsert({
                    where: { name_examType: { name: subject, examType: 'jamb' } },
                    update: {},
                    create: { name: subject, examType: 'jamb' },
                })));
                newSubjects.forEach(s => subjectMap.set(normalizeSubject(s.name), s.id));
            }
            yield prisma.$transaction(scaledSubjectScores.map(({ subject, score }) => prisma.score.upsert({
                where: { jambSessionId_examSubject: { jambSessionId: sessionId, examSubject: subject } },
                update: { score },
                create: {
                    examType: 'jamb',
                    examSubject: subject,
                    subjectId: subjectMap.get(subject),
                    examYear: session.examYear,
                    score,
                    date: new Date(),
                    jambSessionId: sessionId,
                },
            })));
            // Mark session as completed
            const updatedSession = yield prisma.jambExamSession.update({
                where: { id: sessionId },
                data: { isCompleted: true, endTime: new Date() },
                include: { scores: true },
            });
            // Prepare answer feedback for requested questionIds
            const questionDetails = yield Promise.all(questionIds.map((qid) => __awaiter(void 0, void 0, void 0, function* () {
                const questionData = questionMap.get(qid);
                const studentAnswer = answerMap.get(qid) || null;
                return {
                    questionId: qid,
                    correctAnswer: (questionData === null || questionData === void 0 ? void 0 : questionData.answer) || null,
                    studentAnswer,
                    isCorrect: studentAnswer === (questionData === null || questionData === void 0 ? void 0 : questionData.answer)
                };
            })));
            const elapsedTime = new Date(updatedSession.endTime).getTime() - new Date(session.startTime).getTime();
            const totalSeconds = Math.floor(elapsedTime / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            let timeSpent = '';
            if (hours > 0)
                timeSpent += `${hours}hr `;
            if (minutes > 0 || hours > 0)
                timeSpent += `${minutes}min `;
            timeSpent += `${seconds}s`;
            return {
                sessionId,
                subjectScores: scaledSubjectScores.map(({ subject, score, questionCount }) => ({
                    examSubject: formatSubjectForFrontend(subject),
                    score,
                    questionCount,
                })),
                totalScore: scaledTotalScore, // Scaled to max 400
                isCompleted: updatedSession.isCompleted,
                timeSpent: timeSpent.trim(),
                questionDetails, // Added to return detailed information about answers
            };
        }),
    },
    JambExamSession: {
        remainingTime: (parent) => {
            if (parent.isCompleted || parent.endTime)
                return '0s';
            const elapsed = Date.now() - new Date(parent.startTime).getTime();
            const remaining = JAMB_TIME_LIMIT - elapsed;
            const totalSeconds = Math.max(Math.floor(remaining / 1000), 0);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            let remainingTimeStr = '';
            if (hours > 0)
                remainingTimeStr += `${hours}hr `;
            if (minutes > 0 || hours > 0)
                remainingTimeStr += `${minutes}min `;
            remainingTimeStr += `${seconds}s`;
            return remainingTimeStr.trim();
        },
    },
};
