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
// src/resolvers/jamb.ts
const client_1 = require("@prisma/client");
const bcryptjs_1 = require("bcryptjs");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const apollo_server_express_1 = require("apollo-server-express");
const prisma = new client_1.PrismaClient();
const JAMB_TIME_LIMIT = 5400 * 1000; // 90 minutes in milliseconds
const YEARS = [
    '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014',
    '2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'
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
            const session = yield prisma.jambExamSession.findUnique({ where: { id: sessionId } });
            if (!session)
                throw new apollo_server_express_1.ApolloError('Session not found', 'NOT_FOUND');
            if (session.studentId !== studentId)
                throw new apollo_server_express_1.ApolloError('Unauthorized access to session', 'FORBIDDEN');
            if (session.isCompleted)
                throw new apollo_server_express_1.ApolloError('Session already completed', 'INVALID_STATE');
            const subjectQuestions = yield Promise.all(session.subjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
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
    Mutation: {
        registerStudent: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { input }) {
            try {
                const { firstName, lastName, userName, email, phoneNumber, password, studentType } = input;
                if (!firstName || !lastName || !userName || !email || !phoneNumber || !password) {
                    throw new apollo_server_express_1.ApolloError('All fields except studentType are required', 'VALIDATION_ERROR', {
                        missingFields: Object.keys(input).filter(key => !input[key]),
                    });
                }
                if (!email.includes('@') || !email.includes('.')) {
                    throw new apollo_server_express_1.ApolloError('Invalid email format', 'VALIDATION_ERROR', { field: 'email' });
                }
                const phoneDigits = phoneNumber.replace(/\D/g, '');
                if (phoneDigits.length !== 11) {
                    throw new apollo_server_express_1.ApolloError('Phone number must be exactly 11 digits', 'VALIDATION_ERROR', {
                        field: 'phoneNumber',
                        receivedLength: phoneDigits.length,
                    });
                }
                if (password.length < 8) {
                    throw new apollo_server_express_1.ApolloError('Password must be at least 8 characters', 'VALIDATION_ERROR', {
                        field: 'password',
                    });
                }
                if (studentType && !['SCIENCE', 'ART'].includes(studentType)) {
                    throw new apollo_server_express_1.ApolloError('Invalid student type', 'VALIDATION_ERROR', { field: 'studentType' });
                }
                const existingStudent = yield prisma.student.findFirst({
                    where: { OR: [{ userName }, { email }] },
                });
                if (existingStudent) {
                    if (existingStudent.userName === userName && existingStudent.email === email) {
                        throw new apollo_server_express_1.ApolloError('Username and email already exist', 'DUPLICATE_USER', { fields: ['userName', 'email'] });
                    }
                    else if (existingStudent.userName === userName) {
                        throw new apollo_server_express_1.ApolloError('Username already exists', 'DUPLICATE_USER', { field: 'userName' });
                    }
                    else {
                        throw new apollo_server_express_1.ApolloError('Email already exists', 'DUPLICATE_USER', { field: 'email' });
                    }
                }
                const hashedPassword = yield (0, bcryptjs_1.hash)(password, 10);
                const student = yield prisma.student.create({
                    data: {
                        firstName,
                        lastName,
                        userName,
                        email,
                        phoneNumber,
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
                const token = jsonwebtoken_1.default.sign({ id: student.id, userName: student.userName }, process.env.JWT_SECRET || 'your-secret-key', { expiresIn: '1h' });
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
            const trimmedSubjects = subjects.map(s => s.trim().toLowerCase());
            if (trimmedSubjects.length !== 4)
                throw new apollo_server_express_1.ApolloError('Exactly 4 subjects required', 'VALIDATION_ERROR');
            if (!trimmedSubjects.includes('english language'))
                throw new apollo_server_express_1.ApolloError('English Language is compulsory', 'VALIDATION_ERROR');
            if (!YEARS.includes(examYear))
                throw new apollo_server_express_1.ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');
            const validSubjects = ['english language', 'mathematics', 'physics', 'chemistry', 'biology', 'literature', 'government', 'economics'];
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
                remainingTime: '90min 0s', // Initial value, updated by field resolver
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
                const subjectQuestions = questions.filter(q => q.examSubject === subject).slice(0, 20);
                const subjectAnswers = sessionAnswers.filter(a => subjectQuestions.some(q => q.id === a.questionId));
                const score = subjectAnswers.reduce((acc, { question, answer }) => {
                    const submittedOptionText = ['a', 'b', 'c', 'd'].includes(answer.toLowerCase())
                        ? question.options[['a', 'b', 'c', 'd'].indexOf(answer.toLowerCase())]
                        : answer;
                    return acc + (question.answer === submittedOptionText ? 1 : 0);
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
                totalScore,
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
