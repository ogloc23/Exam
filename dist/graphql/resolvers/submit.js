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
exports.submitResolvers = void 0;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011',
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019',
    '2020', '2021', '2022', '2023'];
exports.submitResolvers = {
    Mutation: {
        submitAnswers: (_1, _a) => __awaiter(void 0, [_1, _a], void 0, function* (_, { examType, examSubject, examYear, questionOption }) {
            if (!EXAM_TYPES.includes(examType.toLowerCase())) {
                throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
            }
            if (!YEARS.includes(examYear)) {
                throw new Error(`Invalid year. Supported years: ${YEARS.join(', ')}`);
            }
            try {
                const formattedSubject = `${examSubject.charAt(0).toUpperCase() + examSubject.slice(1)} (${examType.toUpperCase()})`;
                const subject = yield prisma.subject.findFirst({
                    where: {
                        name: formattedSubject,
                        examType: examType.toLowerCase(),
                    },
                });
                if (!subject) {
                    throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
                }
                const questions = yield prisma.question.findMany({
                    where: {
                        examType: examType.toLowerCase(),
                        examSubject: examSubject.toLowerCase(),
                        examYear,
                        id: { in: questionOption.map(q => q.questionId) },
                    },
                });
                if (questions.length !== questionOption.length) {
                    throw new Error(`Some submitted question IDs were not found in the database`);
                }
                let score = 0;
                const detailedResults = questions.map(question => {
                    const userAnswer = questionOption.find(opt => opt.questionId === question.id);
                    const isCorrect = userAnswer && userAnswer.selectedAnswer === question.answer;
                    if (isCorrect)
                        score++;
                    return {
                        id: question.id,
                        question: question.question,
                        options: question.options,
                        answer: question.answer,
                        questionOption: {
                            selectedAnswer: (userAnswer === null || userAnswer === void 0 ? void 0 : userAnswer.selectedAnswer) || null,
                            isCorrect: isCorrect || false,
                            correctAnswer: question.answer,
                        },
                    };
                });
                console.log(`Score calculated: ${score}/${questions.length}`);
                yield prisma.score.create({
                    data: {
                        examType: examType.toLowerCase(),
                        examSubject: examSubject.toLowerCase(),
                        subjectId: subject.id,
                        examYear,
                        score,
                    },
                });
                return {
                    score,
                    total: 20,
                    questions: detailedResults,
                };
            }
            catch (error) {
                console.error('Error in submitAnswers:', error);
                throw new Error(error.message || 'Failed to submit answers');
            }
        }),
    },
};
