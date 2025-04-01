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
// src/scrapers/myschool.ts
const axios_1 = __importDefault(require("axios"));
const cheerio_1 = __importDefault(require("cheerio"));
function scrapeMyschoolQuestions(subject, examYear) {
    return __awaiter(this, void 0, void 0, function* () {
        const baseUrl = 'https://myschool.ng/classroom';
        const url = `${baseUrl}/${subject}?exam_type=jamb&exam_year=${examYear}&type=obj&topic=`;
        const questions = [];
        try {
            const { data } = yield axios_1.default.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                },
            });
            const $ = cheerio_1.default.load(data);
            // Inspect the page structure (adjust selectors based on actual HTML)
            $('.question-block, .question-item').each((i, elem) => {
                const questionText = $(elem).find('.question-text, .q-text').text().trim();
                const options = $(elem)
                    .find('.options, .option-list li, .option')
                    .map((_, opt) => $(opt).text().trim())
                    .get();
                const answer = $(elem).find('.answer, .correct-answer').text().trim() || null; // Answers might be hidden
                if (questionText && options.length > 0) {
                    questions.push({
                        id: `${examYear}-${subject}-${i}`, // Generate a unique ID
                        question: questionText,
                        options,
                        answer, // May be null if not visible
                        examType: 'jamb',
                        examSubject: subject,
                        examYear,
                    });
                }
            });
            console.log(`Scraped ${questions.length} questions from Myschool.ng for ${subject} ${examYear}`);
            return questions;
        }
        catch (error) {
            console.error(`Failed to scrape Myschool.ng: ${error.message}`);
            return [];
        }
    });
}
// Test the scraper
(() => __awaiter(void 0, void 0, void 0, function* () {
    const questions = yield scrapeMyschoolQuestions('mathematics', '2024');
    console.log(JSON.stringify(questions, null, 2));
}))();
