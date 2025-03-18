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
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
const JAMB_SUBJECTS = [
    "English Language", // Compulsory
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Literature",
    "Government",
    "Economics",
    "Geography",
    "Accounting",
    "Commerce",
];
const WAEC_SUBJECTS = [
    "English Language", // Compulsory
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Literature",
    "Government",
    "Economics",
    "Geography",
    "Accounting",
    "Commerce",
    "Agricultural Science",
    "History",
    "Civic Education",
    "Visual Art",
];
const NECO_SUBJECTS = [
    "English Language", // Compulsory (placeholder for now)
    // Add more NECO-specific subjects later
];
function seed() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield prisma.subject.deleteMany();
            console.log('Existing subjects cleared.');
            // Seed JAMB subjects
            yield Promise.all(JAMB_SUBJECTS.map((name) => prisma.subject.create({
                data: {
                    name: `${name} (JAMB)`,
                    examType: 'jamb',
                },
            })));
            // Seed WAEC subjects
            yield Promise.all(WAEC_SUBJECTS.map((name) => prisma.subject.create({
                data: {
                    name: `${name} (WAEC)`,
                    examType: 'waec',
                },
            })));
            // Seed NECO subjects (minimal for now)
            yield Promise.all(NECO_SUBJECTS.map((name) => prisma.subject.create({
                data: {
                    name: `${name} (NECO)`,
                    examType: 'neco',
                },
            })));
            console.log('Subjects seeded successfully!');
        }
        catch (error) {
            console.error('Error seeding subjects:', error);
            throw error;
        }
        finally {
            yield prisma.$disconnect();
        }
    });
}
seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
