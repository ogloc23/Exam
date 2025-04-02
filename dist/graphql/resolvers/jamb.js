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
exports.jambResolvers = {
    Query: {
        years: () => YEARS,
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
            // Validate exactly 4 subjects
            if (session.subjects.length !== 4) {
                throw new apollo_server_express_1.ApolloError(`Exactly 4 subjects required, got ${session.subjects.length}`, 'VALIDATION_ERROR');
            }
            const subjectQuestions = yield Promise.all(session.subjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
                console.log(`Original subject from session: ${subject}`);
                const normalizedSubject = subject.replace(/\s+/g, '-').toLowerCase();
                const VALID_SUBJECTS = [
                    'mathematics', 'english-language', 'fine-arts', 'music', 'french', 'animal-husbandry', 'insurance', 'chemistry',
                    'physics', 'yoruba', 'biology', 'geography', 'literature-in-english', 'economics', 'commerce',
                    'accounts-principles-of-accounts', 'government', 'igbo', 'christian-religious-knowledge', 'agricultural-science',
                    'islamic-religious-knowledge', 'history', 'civic-education', 'further-mathematics', 'arabic', 'home-economics',
                    'hausa', 'book-keeping', 'data-processing', 'catering-craft-practice', 'computer-studies', 'marketing',
                    'physical-education', 'office-practice', 'technical-drawing', 'food-and-nutrition', 'home-management'
                ];
                if (!VALID_SUBJECTS.includes(normalizedSubject)) {
                    throw new apollo_server_express_1.ApolloError(`Invalid subject: ${subject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
                }
                console.log(`Normalized subject: ${normalizedSubject}`);
                let dbQuestions = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: normalizedSubject,
                        examYear: session.examYear,
                    },
                });
                const validQuestions = dbQuestions.filter(q => {
                    const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                    const requiresImage = q.question.toLowerCase().includes('diagram') ||
                        q.question.toLowerCase().includes('figure') ||
                        q.question.toLowerCase().includes('image');
                    const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                    return hasValidOptions && hasImageIfRequired;
                });
                console.log(`Existing valid questions for ${normalizedSubject}: ${validQuestions.length}`);
                if (validQuestions.length < 50) { // Updated to 50
                    console.log(`Insufficient valid questions for ${normalizedSubject}, attempting to fetch...`);
                    let fetchedQuestions = [];
                    try {
                        fetchedQuestions = yield (0, fetch_1.fetchMyschoolQuestions)('jamb', normalizedSubject, examYear, 50 // Target 50 questions
                        );
                        console.log(`Fetched ${fetchedQuestions.length} questions from Myschool.ng for ${normalizedSubject}`);
                        yield prisma.question.createMany({
                            data: fetchedQuestions,
                            skipDuplicates: true,
                        });
                    }
                    catch (myschoolError) {
                        console.error(`Myschool fetch failed for ${normalizedSubject}: ${myschoolError.message}`);
                        try {
                            fetchedQuestions = yield (0, fetch_1.fetchExternalQuestions)('jamb', normalizedSubject, examYear, 25, // Batch size
                            50 // Total target
                            );
                            console.log(`Fetched ${fetchedQuestions.length} questions from ALOC for ${normalizedSubject}`);
                            yield prisma.question.createMany({
                                data: fetchedQuestions,
                                skipDuplicates: true,
                            });
                        }
                        catch (alocError) {
                            console.error(`ALOC fetch failed for ${normalizedSubject}: ${alocError.message}`);
                        }
                    }
                    dbQuestions = yield prisma.question.findMany({
                        where: {
                            examType: 'jamb',
                            examSubject: normalizedSubject,
                            examYear: session.examYear,
                        },
                    });
                    const newValidQuestions = dbQuestions.filter(q => {
                        const hasValidOptions = q.options && q.options.length >= 2 && q.options.every(opt => opt.trim() !== '');
                        const requiresImage = q.question.toLowerCase().includes('diagram') ||
                            q.question.toLowerCase().includes('figure') ||
                            q.question.toLowerCase().includes('image');
                        const hasImageIfRequired = !requiresImage || (requiresImage && q.imageUrl);
                        return hasValidOptions && hasImageIfRequired;
                    });
                    validQuestions.push(...newValidQuestions.filter(q => !validQuestions.some(vq => vq.id === q.id)));
                    console.log(`Updated valid questions for ${normalizedSubject} after fetch: ${validQuestions.length}`);
                }
                const finalQuestions = validQuestions.slice(0, 50); // Updated to 50
                if (finalQuestions.length < 50) {
                    throw new apollo_server_express_1.ApolloError(`Not enough valid questions for ${normalizedSubject}: got ${finalQuestions.length} after fetch attempts`, 'INSUFFICIENT_DATA');
                }
                console.log(`Final valid questions for ${normalizedSubject}: ${finalQuestions.length}`);
                const shuffledQuestions = shuffleArray(finalQuestions);
                return {
                    subject: normalizedSubject,
                    questions: shuffledQuestions.map(q => {
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
            console.log(`Total questions fetched: ${subjectQuestions.reduce((sum, sq) => sum + sq.questions.length, 0)}`);
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
            // Unchanged, keeping as is
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
            // Unchanged, keeping as is
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
        startJambExam: (_1, _a, context_1) => __awaiter(void 0, [_1, _a, context_1], void 0, function* (_, { subjects, examYear }, context) {
            var _b;
            const studentId = authMiddleware(context);
            const trimmedSubjects = subjects.map(s => s.trim().toLowerCase().replace(/\s+/g, '-'));
            if (trimmedSubjects.length !== 4)
                throw new apollo_server_express_1.ApolloError('Exactly 4 subjects required', 'VALIDATION_ERROR');
            if (!trimmedSubjects.includes('english-language'))
                throw new apollo_server_express_1.ApolloError('English Language is compulsory', 'VALIDATION_ERROR');
            if (!YEARS.includes(examYear))
                throw new apollo_server_express_1.ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');
            const validSubjects = [
                'mathematics', 'english-language', 'fine-arts', 'music', 'french', 'animal-husbandry', 'insurance', 'chemistry',
                'physics', 'yoruba', 'biology', 'geography', 'literature-in-english', 'economics', 'commerce',
                'accounts-principles-of-accounts', 'government', 'igbo', 'christian-religious-knowledge', 'agricultural-science',
                'islamic-religious-knowledge', 'history', 'civic-education', 'further-mathematics', 'arabic', 'home-economics',
                'hausa', 'book-keeping', 'data-processing', 'catering-craft-practice', 'computer-studies', 'marketing',
                'physical-education', 'office-practice', 'technical-drawing', 'food-and-nutrition', 'home-management'
            ];
            const invalidSubjects = trimmedSubjects.filter(sub => !validSubjects.includes(sub));
            if (invalidSubjects.length > 0)
                throw new apollo_server_express_1.ApolloError(`Invalid subjects: ${invalidSubjects.join(', ')}`, 'VALIDATION_ERROR');
            const newSession = yield prisma.jambExamSession.create({
                data: {
                    subjects: trimmedSubjects,
                    examYear,
                    startTime: new Date(),
                    isCompleted: false,
                    studentId,
                },
            });
            return {
                id: newSession.id,
                subjects: newSession.subjects,
                startTime: newSession.startTime.toISOString(),
                endTime: ((_b = newSession.endTime) === null || _b === void 0 ? void 0 : _b.toISOString()) || null,
                isCompleted: newSession.isCompleted,
                scores: [],
                remainingTime: '90min 0s',
            };
        }),
        finishJambExam: (_1, _a, context_1) => __awaiter(void 0, [_1, _a, context_1], void 0, function* (_, { sessionId, answers }, context) {
            const studentId = authMiddleware(context);
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
                include: { answers: true },
            });
            if (!session)
                throw new apollo_server_express_1.ApolloError('Session not found', 'NOT_FOUND');
            if (session.studentId !== studentId)
                throw new apollo_server_express_1.ApolloError('Unauthorized access to session', 'FORBIDDEN');
            if (session.isCompleted)
                throw new apollo_server_express_1.ApolloError('JAMB session already completed', 'INVALID_STATE');
            const allSubjects = session.subjects;
            const questions = yield prisma.question.findMany({
                where: { examType: 'jamb', examSubject: { in: allSubjects }, examYear: session.examYear },
            });
            if (answers && answers.length > 0) {
                yield prisma.$transaction(answers.map(({ questionId, answer }) => prisma.answer.upsert({
                    where: { sessionId_questionId: { sessionId, questionId } },
                    update: { answer },
                    create: { sessionId, questionId, answer },
                })));
            }
            const sessionAnswers = yield prisma.answer.findMany({
                where: { sessionId },
                include: { question: true },
            });
            const subjectRecords = yield prisma.subject.findMany({
                where: { name: { in: allSubjects }, examType: 'jamb' },
            });
            let subjectMap = new Map(subjectRecords.map(s => [s.name.toLowerCase(), s.id]));
            const missingSubjects = allSubjects.filter(subject => !subjectMap.has(subject));
            if (missingSubjects.length > 0) {
                const newSubjects = yield prisma.$transaction(missingSubjects.map(subject => prisma.subject.upsert({
                    where: { name_examType: { name: subject, examType: 'jamb' } },
                    update: {},
                    create: { name: subject, examType: 'jamb' },
                })));
                newSubjects.forEach(s => subjectMap.set(s.name.toLowerCase(), s.id));
            }
            const subjectScores = allSubjects.map(subject => {
                const subjectQuestions = questions.filter(q => q.examSubject === subject).slice(0, 50); // Updated to 50
                const subjectAnswers = sessionAnswers.filter(a => subjectQuestions.some(q => q.id === a.questionId));
                const score = subjectAnswers.reduce((acc, { question, answer }) => {
                    const submittedOptionText = ['a', 'b', 'c', 'd'].includes(answer.toLowerCase())
                        ? question.options[['a', 'b', 'c', 'd'].indexOf(answer.toLowerCase())]
                        : answer;
                    return acc + (question.answer === submittedOptionText ? 2 : 0); // 2 points per correct answer
                }, 0);
                return {
                    examType: 'jamb',
                    examSubject: subject,
                    subjectId: subjectMap.get(subject),
                    examYear: session.examYear,
                    score,
                    date: new Date(),
                    jambSessionId: sessionId,
                };
            });
            yield prisma.$transaction(subjectScores.map(score => prisma.score.upsert({
                where: { jambSessionId_examSubject: { jambSessionId: sessionId, examSubject: score.examSubject } },
                update: { score: score.score },
                create: score,
            })));
            const updatedSession = yield prisma.jambExamSession.update({
                where: { id: sessionId },
                data: { isCompleted: true, endTime: new Date() },
                include: { scores: true },
            });
            const totalScore = updatedSession.scores.reduce((sum, score) => sum + score.score, 0);
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
                subjectScores: updatedSession.scores.map(score => ({
                    examSubject: score.examSubject,
                    score: score.score,
                })),
                totalScore, // Max 400 (50 × 2 × 4)
                isCompleted: updatedSession.isCompleted,
                timeSpent: timeSpent.trim(),
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
