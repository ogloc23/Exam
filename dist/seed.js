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
// src/seed.ts
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
            const seedSubjects = (subjects, examType) => __awaiter(this, void 0, void 0, function* () {
                const data = subjects.map(name => ({
                    name: name.toLowerCase(), // Normalize to lowercase
                    examType,
                }));
                yield prisma.subject.createMany({
                    data,
                    skipDuplicates: true, // Rely on @@unique([name, examType])
                });
                console.log(`${examType.toUpperCase()} subjects seeded.`);
            });
            yield seedSubjects(JAMB_SUBJECTS, 'jamb');
            yield seedSubjects(WAEC_SUBJECTS, 'waec');
            yield seedSubjects(NECO_SUBJECTS, 'neco');
            console.log('All subjects seeded successfully!');
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
