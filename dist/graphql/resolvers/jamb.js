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
        // fetchJambSubjectQuestions removed; assume it's imported from fetch.ts in your schema
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
            const invalidSubjects = trimmedSubjects.filter(sub => !validSubjects.includes(sub));
            if (invalidSubjects.length > 0) {
                throw new Error(`Invalid subjects: ${invalidSubjects.join(', ')}`);
            }
            console.log('Creating new JambExamSession with subjects:', trimmedSubjects, 'examYear:', examYear);
            const newSession = yield prisma.jambExamSession.create({
                data: {
                    subjects: trimmedSubjects,
                    examYear,
                    startTime: new Date(),
                    isCompleted: false,
                },
            });
            console.log('Created session:', newSession);
            return newSession;
        }),
        submitAnswer: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId, questionId, answer }) {
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
            });
            if (!session)
                throw new Error('Session not found');
            if (session.isCompleted)
                throw new Error('Session already completed');
            // Validate questionId
            const questionExists = yield prisma.question.findUnique({
                where: { id: questionId },
            });
            if (!questionExists)
                throw new Error(`Invalid questionId: ${questionId} not found`);
            yield prisma.answer.upsert({
                where: {
                    sessionId_questionId: { sessionId, questionId },
                },
                update: { answer: answer.toLowerCase() },
                create: {
                    sessionId,
                    questionId,
                    answer: answer.toLowerCase(),
                },
            });
            return true;
        }),
        finishJambExam: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { sessionId, answers }) {
            const session = yield prisma.jambExamSession.findUnique({
                where: { id: sessionId },
                include: { scores: true, answers: true },
            });
            if (!session)
                throw new Error('Session not found');
            if (session.isCompleted)
                throw new Error('JAMB session already completed');
            const elapsedTime = Date.now() - new Date(session.startTime).getTime();
            if (elapsedTime > JAMB_TIME_LIMIT) {
                yield autoSubmitJambExam(sessionId);
                const expiredSession = yield prisma.jambExamSession.findUnique({
                    where: { id: sessionId },
                    include: { scores: true },
                });
                const totalScore = expiredSession.scores.reduce((sum, score) => sum + score.score, 0);
                return {
                    sessionId,
                    subjectScores: expiredSession.scores.map(score => ({
                        id: score.id,
                        examType: score.examType,
                        examSubject: score.examSubject,
                        subjectId: score.subjectId,
                        examYear: score.examYear,
                        score: score.score,
                        date: score.date,
                    })),
                    totalScore,
                    isCompleted: true,
                    timeSpent: 'Time limit exceeded',
                };
            }
            let sessionAnswers = session.answers;
            if (answers && answers.length > 0) {
                // Fetch valid question IDs (up to 60 per subject from fetchJambSubjectQuestions)
                const validQuestionIds = yield prisma.question.findMany({
                    where: {
                        examType: 'jamb',
                        examSubject: { in: session.subjects },
                        examYear: session.examYear,
                    },
                    select: { id: true },
                }).then(questions => new Set(questions.map(q => q.id)));
                const validAnswers = answers.filter(({ questionId }) => {
                    if (!validQuestionIds.has(questionId)) {
                        console.warn(`Skipping invalid questionId: ${questionId} for session ${sessionId}`);
                        return false;
                    }
                    return true;
                });
                if (validAnswers.length > 0) {
                    yield prisma.answer.createMany({
                        data: validAnswers.map(({ questionId, answer }) => ({
                            sessionId,
                            questionId,
                            answer: answer.toLowerCase(),
                        })),
                        skipDuplicates: true,
                    });
                    sessionAnswers = yield prisma.answer.findMany({
                        where: { sessionId },
                    });
                }
            }
            const allSubjects = session.subjects;
            // Fetch all questions (up to 60 per subject) to score against
            const questions = yield prisma.question.findMany({
                where: {
                    examType: 'jamb',
                    examSubject: { in: allSubjects },
                    examYear: session.examYear,
                },
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
                const subjectQuestions = questions.filter(q => q.examSubject === subject).slice(0, 60); // Cap at 60
                const subjectAnswers = sessionAnswers.filter(a => subjectQuestions.some(q => q.id === a.questionId));
                const score = subjectAnswers.reduce((acc, { questionId, answer }) => {
                    const question = subjectQuestions.find(q => q.id === questionId);
                    return acc + (question && question.answer.toLowerCase() === answer.toLowerCase() ? 1 : 0);
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
                where: {
                    jambSessionId_examSubject: {
                        jambSessionId: sessionId,
                        examSubject: score.examSubject,
                    },
                },
                update: { score: score.score },
                create: score,
            })));
            const updatedSession = yield prisma.jambExamSession.update({
                where: { id: sessionId },
                data: { isCompleted: true, endTime: new Date() },
                include: { scores: true },
            });
            const totalScore = updatedSession.scores.reduce((sum, score) => sum + score.score, 0);
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
                    id: score.id,
                    examType: score.examType,
                    examSubject: score.examSubject,
                    subjectId: score.subjectId,
                    examYear: score.examYear,
                    score: score.score,
                    date: score.date,
                })),
                totalScore,
                isCompleted: updatedSession.isCompleted,
                timeSpent: timeSpent.trim(),
            };
        }),
    },
    JambExamSession: {
        remainingTime: (parent) => {
            if (parent.isCompleted)
                return "0s";
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
function autoSubmitJambExam(sessionId) {
    return __awaiter(this, void 0, void 0, function* () {
        const session = yield prisma.jambExamSession.findUnique({
            where: { id: sessionId },
            include: { scores: true, answers: true },
        });
        if (!session || session.isCompleted)
            return;
        const allSubjects = session.subjects;
        const remainingSubjects = allSubjects.filter(subject => !session.scores.some(score => score.examSubject === subject));
        if (remainingSubjects.length > 0) {
            const subjectRecords = yield prisma.subject.findMany({
                where: { name: { in: remainingSubjects }, examType: 'jamb' },
            });
            let subjectMap = new Map(subjectRecords.map(s => [s.name.toLowerCase(), s.id]));
            const missingSubjects = remainingSubjects.filter(subject => !subjectMap.has(subject));
            if (missingSubjects.length > 0) {
                const newSubjects = yield prisma.$transaction(missingSubjects.map(subject => prisma.subject.upsert({
                    where: { name_examType: { name: subject, examType: 'jamb' } },
                    update: {},
                    create: { name: subject, examType: 'jamb' },
                })));
                newSubjects.forEach(s => subjectMap.set(s.name.toLowerCase(), s.id));
            }
            const sessionAnswers = session.answers;
            const questionIds = sessionAnswers.map(a => a.questionId);
            const questions = yield prisma.question.findMany({
                where: {
                    examType: 'jamb',
                    examSubject: { in: remainingSubjects },
                    examYear: session.examYear,
                    id: { in: questionIds },
                },
            });
            const subjectScores = remainingSubjects.map(subject => {
                const subjectQuestions = questions.filter(q => q.examSubject === subject).slice(0, 60); // Cap at 60
                const subjectAnswers = sessionAnswers.filter(a => subjectQuestions.some(q => q.id === a.questionId));
                const score = subjectAnswers.reduce((acc, { questionId, answer }) => {
                    const question = subjectQuestions.find(q => q.id === questionId);
                    return acc + (question && question.answer.toLowerCase() === answer.toLowerCase() ? 1 : 0);
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
            yield prisma.score.createMany({
                data: subjectScores,
                skipDuplicates: true,
            });
        }
        yield prisma.jambExamSession.update({
            where: { id: sessionId },
            data: { isCompleted: true, endTime: new Date() },
        });
    });
}
