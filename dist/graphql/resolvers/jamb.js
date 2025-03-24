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
exports.jambResolvers = void 0;
// src/graphql/resolvers/jamb.ts
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011',
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
    '2020', '2021', '2022', '2023'];
const JAMB_TIME_LIMIT = 5400 * 1000; // 90 minutes in milliseconds
exports.jambResolvers = {
    Query: {
        years: () => YEARS,
        fetchJambSubjectQuestions: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId }) {
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
            });
            if (!session || session.isCompleted) {
                throw new Error('Invalid or completed JAMB session');
            }
            const allSubjects = ['english language', 'mathematics', 'physics', 'chemistry'];
            const subjectQuestions = yield Promise.all(allSubjects.map((subject) => __awaiter(void 0, void 0, void 0, function* () {
                const questions = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: subject,
                        examYear: session.examYear,
                    },
                    take: 20,
                });
                if (questions.length < 20) {
                    throw new Error(`Insufficient questions for ${subject}: got ${questions.length}, need 20`);
                }
                return {
                    subject,
                    questions: questions.map(q => ({
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
        startJambExam: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { subjects, examYear }) {
            const trimmedSubjects = subjects.map(s => s.trim().toLowerCase());
            if (trimmedSubjects.length !== 4)
                throw new Error('Exactly 4 subjects required');
            if (!trimmedSubjects.includes('english language'))
                throw new Error('English Language is compulsory');
            if (!YEARS.includes(examYear))
                throw new Error(`Invalid year: ${examYear}`);
            const validSubjects = ['english language', 'mathematics', 'physics', 'chemistry'];
            if (!trimmedSubjects.every(sub => validSubjects.includes(sub))) {
                const invalid = trimmedSubjects.filter(sub => !validSubjects.includes(sub));
                throw new Error(`Invalid subjects: ${invalid.join(', ')}`);
            }
            const session = yield prisma.jambExamSession.create({
                data: {
                    subjects: trimmedSubjects,
                    examYear,
                    startTime: new Date(),
                    isCompleted: false,
                },
            });
            return session;
        }),
        finishJambExam: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId, answers }) {
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
                include: { scores: true },
            });
            if (!session)
                throw new Error('Session not found');
            if (session.isCompleted)
                throw new Error('JAMB session already completed');
            const startTime = new Date(session.startTime).getTime();
            const currentTime = new Date().getTime();
            const elapsedTime = currentTime - startTime;
            if (elapsedTime > JAMB_TIME_LIMIT) {
                yield autoSubmitJambExam(sessionId);
                const expiredSession = yield prisma.jambExamSession.findUnique({
                    where: { id: sessionId },
                    include: { scores: true },
                });
                const totalScore = expiredSession.scores.reduce((sum, score) => sum + score.score, 0);
                return {
                    sessionId,
                    subjectScores: expiredSession.scores,
                    totalScore,
                    isCompleted: true,
                    timeSpent: 'Time limit exceeded',
                };
            }
            const allSubjects = ['english language', 'mathematics', 'physics', 'chemistry'];
            const questions = yield prisma.question.findMany({
                where: {
                    examType: 'jamb',
                    examSubject: { in: allSubjects },
                    examYear: session.examYear,
                    id: { in: answers.map(a => a.questionId) },
                },
            });
            if (questions.length !== answers.length)
                throw new Error('Invalid question IDs');
            // Save answers
            yield prisma.answer.createMany({
                data: answers.map(({ questionId, answer }) => ({
                    sessionId,
                    questionId,
                    answer: answer.toLowerCase(),
                })),
                skipDuplicates: true,
            });
            // Fetch subject IDs
            const subjectRecords = yield prisma.subject.findMany({
                where: { name: { in: allSubjects }, examType: 'jamb' },
            });
            const subjectMap = new Map(subjectRecords.map(s => [s.name.toLowerCase(), s.id]));
            // Calculate and save scores
            const subjectScores = allSubjects.map(subject => {
                const subjectQuestions = questions.filter(q => q.examSubject === subject);
                const subjectAnswers = answers.filter(a => subjectQuestions.some(q => q.id === a.questionId));
                const score = subjectAnswers.reduce((acc, { questionId, answer }) => {
                    const question = subjectQuestions.find(q => q.id === questionId);
                    return acc + (question && question.answer === answer.toLowerCase() ? 1 : 0);
                }, 0);
                return {
                    examType: 'jamb',
                    examSubject: subject,
                    subjectId: subjectMap.get(subject), // Required field
                    examYear: session.examYear,
                    score,
                    date: new Date(),
                    jambSessionId: sessionId,
                };
            });
            yield prisma.score.createMany({
                data: subjectScores,
                skipDuplicates: true,
            });
            const totalScore = subjectScores.reduce((sum, score) => sum + score.score, 0);
            const updatedSession = yield prisma.jambExamSession.update({
                where: { id: sessionId },
                data: { isCompleted: true, endTime: new Date() },
                include: { scores: true },
            });
            const totalSeconds = Math.floor(elapsedTime / 1000);
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            let timeSpent = '';
            if (hours > 0)
                timeSpent += `${hours}hr `;
            if (minutes > 0 || hours > 0)
                timeSpent += `${minutes}min `;
            if (seconds > 0 || (hours === 0 && minutes === 0))
                timeSpent += `${seconds}s`;
            timeSpent = timeSpent.trim();
            return {
                sessionId,
                subjectScores: updatedSession.scores,
                totalScore,
                isCompleted: updatedSession.isCompleted,
                timeSpent,
            };
        }),
    },
    JambExamSession: {
        remainingTime: (parent) => {
            if (parent.isCompleted)
                return "0s";
            const startTime = new Date(parent.startTime).getTime();
            const currentTime = new Date().getTime();
            const elapsed = currentTime - startTime;
            const remaining = JAMB_TIME_LIMIT - elapsed;
            const totalSeconds = Math.floor(remaining / 1000);
            if (totalSeconds <= 0)
                return "0s";
            const hours = Math.floor(totalSeconds / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            const seconds = totalSeconds % 60;
            let remainingTimeStr = '';
            if (hours > 0)
                remainingTimeStr += `${hours}hr `;
            if (minutes > 0 || hours > 0)
                remainingTimeStr += `${minutes}min `;
            if (seconds > 0 || (hours === 0 && minutes === 0))
                remainingTimeStr += `${seconds}s`;
            return remainingTimeStr.trim();
        },
    },
};
function autoSubmitJambExam(sessionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = yield prisma.jambExamSession.findUnique({
            where: { id: sessionId },
            include: { scores: true },
        });
        if (!session || session.isCompleted)
            return;
        const allSubjects = ['english language', 'mathematics', 'physics', 'chemistry'];
        const remainingSubjects = allSubjects.filter(subject => !session.scores.some(score => score.examSubject === subject));
        if (remainingSubjects.length > 0) {
            const subjectRecords = yield prisma.subject.findMany({
                where: { name: { in: remainingSubjects }, examType: 'jamb' },
            });
            const subjectMap = new Map(subjectRecords.map(s => [s.name.toLowerCase(), s.id]));
            yield prisma.score.createMany({
                data: remainingSubjects.map(subject => ({
                    examType: 'jamb',
                    examSubject: subject,
                    subjectId: subjectMap.get(subject), // Required field
                    examYear: session.examYear,
                    score: 0,
                    date: new Date(),
                    jambSessionId: sessionId,
                })),
            });
        }
        yield prisma.jambExamSession.update({
            where: { id: sessionId },
            data: { isCompleted: true, endTime: new Date() },
        });
    });
}
