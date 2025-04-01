// src/scrapers/myschool.ts
import axios from 'axios';
import cheerio from 'cheerio';

async function scrapeMyschoolQuestions(subject: string, examYear: string): Promise<any[]> {
  const baseUrl = 'https://myschool.ng/classroom';
  const url = `${baseUrl}/${subject}?exam_type=jamb&exam_year=${examYear}&type=obj&topic=`;
  const questions: any[] = [];

  try {
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    });

    const $ = cheerio.load(data);

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
  } catch (error: any) {
    console.error(`Failed to scrape Myschool.ng: ${error.message}`);
    return [];
  }
}

// Test the scraper
(async () => {
  const questions = await scrapeMyschoolQuestions('mathematics', '2024');
  console.log(JSON.stringify(questions, null, 2));
})();