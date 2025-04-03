// src/resolvers/fetch.ts
import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { ApolloError } from 'apollo-server-express';
import { PrismaClient } from '@prisma/client';

// Instantiate Prisma client directly
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Cloudinary result interface
interface CloudinaryUploadResult {
  secure_url: string;
  [key: string]: any;
}

const BASE_API_URL = 'https://questions.aloc.com.ng/api/v2';
const ACCESS_TOKEN = 'QB-385a71b4a2ed9fd0bd27';
const EXAM_TYPES = ['jamb', 'waec', 'neco'] as const;
const YEARS = [
  '2025', '2024', '2023', '2022', '2021', '2020', '2019', '2018', '2017', '2016',
  '2015', '2014', '2013', '2012', '2011', '2010', '2009', '2008', '2007', '2006', '2005'
] as const;

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
] as const;

// Expanded subject mapping for ALOC and Myschool.ng
const API_SUBJECT_MAP: { [key: string]: string } = {
  'english-language': 'english',
  'literature-in-english': 'literature',
  'accounts-principles-of-accounts': 'accounts',
  'christian-religious-knowledge': 'crk',
  'islamic-religious-knowledge': 'irk',
  'agricultural-science': 'agriculture',
  'further-mathematics': 'further-maths',
};

const MY_SCHOOL_SUBJECT_MAP: { [key: string]: string } = {
  'english-language': 'english-language',
  'literature-in-english': 'literature-in-english',
  'accounts-principles-of-accounts': 'principles-of-accounts',
  'christian-religious-knowledge': 'christian-religious-studies',
  'islamic-religious-knowledge': 'islamic-studies',
  'agricultural-science': 'agricultural-science',
  'further-mathematics': 'further-mathematics',
};

const apiClient = axios.create({
  baseURL: BASE_API_URL,
  headers: {
    'AccessToken': ACCESS_TOKEN,
    'Accept': 'application/json',
  },
});

type ExamType = typeof EXAM_TYPES[number];
type ExamYear = typeof YEARS[number];
type ExamSubject = typeof VALID_SUBJECTS[number];

interface Question {
  id: string;
  question: string;
  options: string[];
  answer: string | null;
  examType: ExamType;
  examSubject: ExamSubject;
  examYear: ExamYear;
  answerUrl?: string;
  imageUrl?: string | null;
}

interface PrismaQuestion {
  id: string;
  question: string;
  options: string[];
  answer: string | null;
  examType: string;
  examSubject: string;
  examYear: string;
  answerUrl: string | null;
  imageUrl: string | null;
}

async function fetchExternalQuestions(
  examType: ExamType,
  examSubject: ExamSubject,
  examYear: ExamYear,
  batchSize: number = 20,
  totalTarget: number = 40
): Promise<Question[]> {
  const examTypeLower = examType.toLowerCase() as ExamType;
  if (!EXAM_TYPES.includes(examTypeLower)) throw new ApolloError('Invalid exam type', 'VALIDATION_ERROR');

  const normalizedSubject = examSubject.toLowerCase().trim() as ExamSubject;
  if (!YEARS.includes(examYear)) throw new ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');
  if (!VALID_SUBJECTS.includes(normalizedSubject)) {
    throw new ApolloError(`Invalid subject: ${examSubject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
  }

  const apiSubject = API_SUBJECT_MAP[normalizedSubject] || normalizedSubject;
  const dbSubject = normalizedSubject;

  let allQuestions: Question[] = [];
  const seenIds = new Set<string>();
  const maxAttemptsPerBatch = 30;

  const fetchBatch = async (target: number): Promise<Question[]> => {
    const batchQuestions: Question[] = [];
    let attempts = 0;

    while (batchQuestions.length < target && attempts < maxAttemptsPerBatch) {
      try {
        const response = await apiClient.get('/q', {
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

        if (!questionData.length || !questionData[0]?.id) {
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
          .filter((opt): opt is string => typeof opt === 'string' && opt !== '')
          .map(opt => opt);

        if (options.length < 2) {
          attempts++;
          continue;
        }

        const answerIndex = ['a', 'b', 'c', 'd'].indexOf(String(question.answer ?? '').toLowerCase());
        const answerText = answerIndex !== -1 ? options[answerIndex] : question.answer || null;

        const formattedQuestion: Question = {
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
      } catch (apiError: any) {
        console.error(`ALOC API call failed for ${apiSubject} ${examYear}: ${apiError.message}`, apiError.response?.data);
        attempts++;
      }
      attempts++;
    }

    console.log(`ALOC Batch completed: ${batchQuestions.length} questions fetched`);
    return batchQuestions;
  };

  const firstBatch = await fetchBatch(batchSize);
  allQuestions = allQuestions.concat(firstBatch);

  if (allQuestions.length >= batchSize) {
    const secondBatch = await fetchBatch(batchSize);
    allQuestions = allQuestions.concat(secondBatch);
  }

  if (allQuestions.length < totalTarget) {
    throw new ApolloError(`Only fetched ${allQuestions.length} questions from ALOC, needed ${totalTarget}`, 'EXTERNAL_API_ERROR');
  }

  console.log(`Total fetched from ALOC: ${allQuestions.length} questions`);
  return allQuestions.slice(0, totalTarget);
}

async function fetchMyschoolQuestions(
  examType: ExamType,
  examSubject: ExamSubject,
  examYear: ExamYear
): Promise<Question[]> {
  const examTypeLower = examType.toLowerCase() as ExamType;
  if (!EXAM_TYPES.includes(examTypeLower)) throw new ApolloError('Invalid exam type', 'VALIDATION_ERROR');

  const normalizedSubject = examSubject.toLowerCase().trim() as ExamSubject;
  if (!YEARS.includes(examYear)) throw new ApolloError(`Invalid year: ${examYear}`, 'VALIDATION_ERROR');
  if (!VALID_SUBJECTS.includes(normalizedSubject)) {
    throw new ApolloError(`Invalid subject: ${examSubject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
  }

  const dbSubject = normalizedSubject;
  const myschoolSubject = MY_SCHOOL_SUBJECT_MAP[normalizedSubject] || normalizedSubject;
  let allQuestions: Question[] = [];
  const seenIds = new Set<string>();
  let page = 1;

  const fetchPage = async (pageUrl: string): Promise<void> => {
    console.log(`Fetching ${examSubject} from URL: ${pageUrl}`);
    try {
      const response = await axios.get(pageUrl, {
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

      questionElements.each((i: number, elem: any) => {
        const questionText = $(elem).find('.question-desc p').text().trim();
        const options = $(elem)
          .find('ul.list-unstyled li')
          .map((_: number, opt: any) => $(opt).text().trim().replace(/\n\s+/g, ' '))
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
        await fetchPage(nextPageUrl);
      }
    } catch (error: any) {
      console.error(`Failed to fetch ${examSubject} page ${page}: ${error.message}`);
    }
  };

  const initialUrl = `https://myschool.ng/classroom/${myschoolSubject}?exam_type=jamb&exam_year=${examYear}&type=obj&topic=`;
  await fetchPage(initialUrl);

  for (const question of allQuestions) {
    if (question.answerUrl) {
      try {
        const answerResponse = await axios.get(question.answerUrl, {
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
            answerText = question.options[optionIndex]?.trim() || null;
          }
        }
        question.answer = answerText;
        console.log(`Fetched answer for ${question.id}: ${answerText}`);
      } catch (error: any) {
        console.error(`Failed to fetch answer for ${question.id}: ${error.message}`);
      }
    }

    if (question.imageUrl) {
      try {
        const imageResponse = await axios.get(question.imageUrl, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(imageResponse.data);
        const uploadResult = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { public_id: `questions/${question.id}`, folder: 'myschool_scraper' },
            (error, result) => (error ? reject(error) : resolve(result as CloudinaryUploadResult))
          );
          stream.end(imageBuffer);
        });
        question.imageUrl = uploadResult.secure_url;
        console.log(`Uploaded image for ${question.id}: ${question.imageUrl}`);
      } catch (error: any) {
        console.error(`Failed to upload image for ${question.id}: ${error.message}`);
      }
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  try {
    for (const question of allQuestions) {
      await prisma.question.upsert({
        where: { id: question.id },
        update: { ...question },
        create: { ...question },
      });
    }
    console.log(`Saved ${allQuestions.length} ${examSubject} questions to database`);
  } catch (error: any) {
    console.error(`Failed to save ${examSubject} questions: ${error.message}`);
  }

  console.log(`Total fetched from Myschool.ng: ${allQuestions.length} questions for ${examSubject}`);
  return allQuestions;
}

async function fetchAllSubjectsQuestions(
  examType: ExamType,
  examYear: ExamYear
): Promise<{ subject: string; questions: Question[] }[]> {
  const allSubjectsQuestions: { subject: string; questions: Question[] }[] = [];

  for (const subject of VALID_SUBJECTS) {
    console.log(`Starting fetch for ${subject} ${examYear}`);
    try {
      const subjectQuestions = await fetchMyschoolQuestions(examType, subject, examYear);
      allSubjectsQuestions.push({ subject, questions: subjectQuestions });
      console.log(`Completed fetch for ${subject}: ${subjectQuestions.length} questions`);
    } catch (error: any) {
      console.error(`Error fetching ${subject}: ${error.message}`);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`Total subjects fetched: ${allSubjectsQuestions.length}`);
  return allSubjectsQuestions;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export { fetchExternalQuestions, fetchMyschoolQuestions, fetchAllSubjectsQuestions, shuffleArray };
export type { ExamType, ExamYear, ExamSubject, Question };
export const fetchResolvers = {
  Query: {
    fetchExternalQuestions: async (
      _: any,
      { examType, examSubject, examYear }: { examType: ExamType; examSubject: ExamSubject; examYear: ExamYear }
    ) => {
      const questions = await fetchExternalQuestions(examType, examSubject, examYear);
      await prisma.question.createMany({
        data: questions,
        skipDuplicates: true,
      });
      return questions;
    },

    fetchMyschoolQuestions: async (
      _: any,
      { examType, examSubject, examYear }: { examType: ExamType; examSubject: ExamSubject; examYear: ExamYear }
    ) => {
      const questions = await fetchMyschoolQuestions(examType, examSubject, examYear);
      return questions; 
    },

    fetchAllSubjectsQuestions: async (
      _: any,
      { examType, examYear }: { examType: ExamType; examYear: ExamYear }
    ) => {
      const subjectQuestions = await fetchAllSubjectsQuestions(examType, examYear);
      const flatQuestions = subjectQuestions.flatMap(sq => sq.questions);
      return flatQuestions;
    },

    fetchStudentQuestions: async (
      _: any,
      { examType, examSubject, examYear }: { examType: ExamType; examSubject: ExamSubject; examYear: ExamYear }
    ) => {
      const dbSubject = examSubject.toLowerCase().trim() as ExamSubject;
      const questionsRaw = await prisma.question.findMany({
        where: {
          examType: examType.toLowerCase(),
          examSubject: dbSubject,
          examYear,
        },
        take: 20,
      });
      const questions: Question[] = questionsRaw.map(q => ({
        ...q,
        examType: q.examType as ExamType,
        examSubject: q.examSubject as ExamSubject,
        examYear: q.examYear as ExamYear,
        answerUrl: q.answerUrl ?? undefined,
        imageUrl: q.imageUrl ?? undefined,
      }));

      if (questions.length < 20) {
        const additionalQuestions = await fetchExternalQuestions(examType, examSubject, examYear);
        await prisma.question.createMany({
          data: additionalQuestions,
          skipDuplicates: true,
        });
        const updatedQuestionsRaw = await prisma.question.findMany({
          where: {
            examType: examType.toLowerCase(),
            examSubject: dbSubject,
            examYear,
          },
          take: 20,
        });
        const updatedQuestions: Question[] = updatedQuestionsRaw.map(q => ({
          ...q,
          examType: q.examType as ExamType,
          examSubject: q.examSubject as ExamSubject,
          examYear: q.examYear as ExamYear,
          answerUrl: q.answerUrl ?? undefined,
          imageUrl: q.imageUrl ?? undefined,
        }));

        if (updatedQuestions.length < 20) {
          throw new ApolloError(`Insufficient questions: got ${updatedQuestions.length}, need 20`, 'INSUFFICIENT_DATA');
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
    },

    fetchJambSubjectQuestions: async (_: any, { sessionId }: { sessionId: string }) => {
      const session = await prisma.jambExamSession.findUnique({ 
        where: { id: parseInt(sessionId) }
      });
      if (!session) throw new ApolloError(`Session ${sessionId} not found`, 'NOT_FOUND');
      if (session.isCompleted) throw new ApolloError(`Session ${sessionId} is completed`, 'INVALID_STATE');

      console.log(`Processing session ${sessionId} with subjects: ${session.subjects}, year: ${session.examYear}`);

      if (!YEARS.includes(session.examYear as any)) {
        throw new ApolloError(`Invalid exam year: ${session.examYear}. Must be one of: ${YEARS.join(', ')}`, 'VALIDATION_ERROR');
      }
      const examYear: ExamYear = session.examYear as ExamYear;

      const subjectQuestions = await Promise.all(
        session.subjects.map(async (subject) => {
          console.log(`Original subject from session: ${subject}`);
          
          const normalizedSubject = subject.replace(/\s+/g, '-').toLowerCase() as ExamSubject;
          if (!VALID_SUBJECTS.includes(normalizedSubject)) {
            throw new ApolloError(`Invalid subject: ${subject}. Valid subjects are: ${VALID_SUBJECTS.join(', ')}`, 'VALIDATION_ERROR');
          }
          console.log(`Normalized subject: ${normalizedSubject}`);

          let existingQuestionsRaw = await prisma.question.findMany({
            where: {
              examType: 'jamb',
              examSubject: normalizedSubject,
              examYear: session.examYear,
            },
          });
          let existingQuestions: Question[] = existingQuestionsRaw.map(q => ({
            ...q,
            examType: q.examType as ExamType,
            examSubject: q.examSubject as ExamSubject,
            examYear: q.examYear as ExamYear,
            answerUrl: q.answerUrl ?? undefined,
            imageUrl: q.imageUrl ?? undefined,
          }));
          console.log(`Existing questions for ${normalizedSubject}: ${existingQuestions.length}`);

          if (existingQuestions.length < 40) {
            let fetchedQuestions: Question[] = [];
            try {
              fetchedQuestions = await fetchExternalQuestions(
                'jamb',
                normalizedSubject,
                examYear
              );
              console.log(`Fetched ${fetchedQuestions.length} questions from ALOC for ${normalizedSubject}`);
              await prisma.question.createMany({
                data: fetchedQuestions,
                skipDuplicates: true,
              });
            } catch (alocError: any) {
              console.error(`ALOC fetch failed for ${normalizedSubject}: ${alocError.message}`);
              try {
                fetchedQuestions = await fetchMyschoolQuestions(
                  'jamb',
                  normalizedSubject,
                  examYear
                );
                console.log(`Fetched ${fetchedQuestions.length} questions from Myschool.ng for ${normalizedSubject}`);
                await prisma.question.createMany({
                  data: fetchedQuestions,
                  skipDuplicates: true,
                });
              } catch (myschoolError: any) {
                console.error(`Myschool fetch failed for ${normalizedSubject}: ${myschoolError.message}`);
              }
            }

            existingQuestionsRaw = await prisma.question.findMany({
              where: {
                examType: 'jamb',
                examSubject: normalizedSubject,
                examYear: session.examYear,
              },
            });
            existingQuestions = existingQuestionsRaw.map(q => ({
              ...q,
              examType: q.examType as ExamType,
              examSubject: q.examSubject as ExamSubject,
              examYear: q.examYear as ExamYear,
              answerUrl: q.answerUrl ?? undefined,
              imageUrl: q.imageUrl ?? undefined,
            }));
            console.log(`Updated questions for ${normalizedSubject} after fetch: ${existingQuestions.length}`);
          }

          const dbQuestionsRaw = await prisma.question.findMany({
            where: {
              examType: 'jamb',
              examSubject: normalizedSubject,
              examYear: session.examYear,
            },
            take: 20,
          });
          const dbQuestions: Question[] = dbQuestionsRaw.map(q => ({
            ...q,
            examType: q.examType as ExamType,
            examSubject: q.examSubject as ExamSubject,
            examYear: q.examYear as ExamYear,
            answerUrl: q.answerUrl ?? undefined,
            imageUrl: q.imageUrl ?? undefined,
          }));
          console.log(`Final questions fetched for ${normalizedSubject}: ${dbQuestions.length}`);

          if (dbQuestions.length < 20) {
            throw new ApolloError(`Not enough questions for ${normalizedSubject}: got ${dbQuestions.length} after fetch attempts`, 'INSUFFICIENT_DATA');
          }

          const shuffledQuestions = shuffleArray(dbQuestions);
          return {
            subject: normalizedSubject,
            questions: shuffledQuestions.map(q => ({
              id: q.id,
              question: q.question,
              options: q.options,
              imageUrl: q.imageUrl,
            })),
          };
        })
      );

      return subjectQuestions;
    },
  },
};