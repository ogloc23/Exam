import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const EXAM_TYPES = ['jamb', 'waec', 'neco'];
const YEARS = ['2005', '2006', '2007', '2008', '2009', '2010', '2011', 
    '2012', '2013', '2014', '2015', '2016', '2017', '2018', '2019', 
    '2020', '2021', '2022', '2023'];

export const examResolvers = {
  Query: {
    examTypes: async () => EXAM_TYPES,

    subjects: async (_: any, { examType }: { examType: string }) => {
      if (!EXAM_TYPES.includes(examType.toLowerCase())) {
        throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
      }
      try {
        const subjects = await prisma.subject.findMany({
          where: {
            examType: examType.toLowerCase(),
          },
          select: {
            id: true,
            name: true,
          },
        });
        if (subjects.length === 0) {
          throw new Error(`No subjects found for exam type "${examType}"`);
        }
        return subjects;
      } catch (error) {
        console.error('Error fetching subjects:', error);
        throw new Error('Failed to fetch subjects from database');
      }
    },

    years: async (_: any, { examType, examSubject }: { examType: string; examSubject: string }) => {
      if (!EXAM_TYPES.includes(examType.toLowerCase())) {
        throw new Error('Invalid exam type. Supported types: "jamb", "waec", "neco"');
      }
      try {
        const formattedSubject = `${examSubject} (${examType.toUpperCase()})`;
        console.log(`Looking up subject: "${formattedSubject}" for examType: "${examType}"`); // Debug log
        const subject = await prisma.subject.findFirst({
          where: { 
            name: formattedSubject,
            examType: examType.toLowerCase(),
          },
        });
        if (!subject) {
          throw new Error(`Subject "${examSubject}" not found for exam type "${examType}"`);
        }
        return YEARS;
      } catch (error) {
        console.error('Error fetching years:', error);
        throw new Error('Failed to fetch years');
      }
    },
  },
};