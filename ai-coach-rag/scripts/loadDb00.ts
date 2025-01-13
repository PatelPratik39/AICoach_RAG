import {DataAPIClient} from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import axios from "axios";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "Openai";
import pdfParse from "pdf-parse";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";

import "dotenv/config"

    type SimiliarityMetric = "dot_product" | "cosine" | "euclidean"

    const {ASTRA_DB_NAMESPACE,ASTRA_DB_COLLECTION,ASTRA_DB_API_ENDPOINT,ASTRA_DB_APPLICATION_TOKEN,OPENAI_API_KEY} = process.env

    const openai = new OpenAI({apiKey: OPENAI_API_KEY})

    const aiCoachData = [
        "https://nces.ed.gov/pubs92/92022.pdf",
        "https://www.isbe.net/ilreportcarddata",
        'https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/24-RC-Pub-Data-Set.xlsx',
        'https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/IL-Student-Growth-2024-CohortvsBaseline.xlsx'
    ]

    // Function to process a PDF file and extract its content
    const processPDF = async (filePath: string): Promise<string> => {
        const pdfBuffer = fs.readFileSync(filePath); // Read the PDF file as a buffer
        const pdfData = await pdfParse(pdfBuffer); // Extract text using pdf-parse
        return pdfData.text; // Return the extracted text
    };

    const loadPDFData = async () => {
    const filePath = path.resolve(__dirname, "./downloads/sample.pdf"); // Path to the PDF
    const text = await processPDF(filePath); // Extract text from the PDF
    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000, // Adjust chunk size as needed
        chunkOverlap: 200,
    });
    const chunks = await splitter.splitText(text); // Split the text into chunks

  console.log("Chunks:", chunks);
  // You can now process the chunks (e.g., generate embeddings, store in a DB)
};

    const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
    const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE})

    const splitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });

// const createCollection = async(similarityMetric: SimiliarityMetric = "dot_product") => {
//     const res = await db.createCollection(ASTRA_DB_COLLECTION, {
//         vector:{
//             dimension: 1536,
//             metric: similarityMetric
//         }
//     })
//     console.log(res)
// }

const createCollection = async (similarityMetric: SimiliarityMetric = "dot_product") => {
    try {
        // Attempt to create the collection with the specified vector configuration
        const res = await db.createCollection(ASTRA_DB_COLLECTION, {
            vector: {
                dimension: 1536,
                metric: similarityMetric,
            },
        });
        console.log(`Collection '${ASTRA_DB_COLLECTION}' created successfully.`);
        console.log(res);
    } catch (error: any) {
        // Handle the error if the collection already exists
        if (error.name === "CollectionAlreadyExistsError") {
            console.log(`Collection '${ASTRA_DB_COLLECTION}' already exists. Skipping creation.`);
        } else {
            // Log and rethrow other errors
            console.error(`Error creating collection '${ASTRA_DB_COLLECTION}':`, error.message);
            throw error;
        }
    }
};






const loadSampleData = async () => {
    const collection = db.collection(ASTRA_DB_COLLECTION);

    for await (const url of aiCoachData) {
        try {
            console.log(`Downloading file from URL: ${url}`);
            const filePath = await downloadFile(url); // Ensure this function saves the file locally
            if (filePath) {
                console.log(`File downloaded and saved to: ${filePath}`);
                const fileExtension = path.extname(filePath);

                // Check if the file is an Excel file
                if (fileExtension === ".xlsx" || fileExtension === ".xls") {
                    const data = processExcelFile(filePath);
                    if (data) {
                        for (const row of data) {
                            // Insert each row of the Excel data into the database
                            const embedding = await openai.embeddings.create({
                                model: "text-embedding-ada-002",
                                input: JSON.stringify(row), // Convert row to a string
                                encoding_format: "float",
                            });

                            const vector = embedding.data[0].embedding;
                            const res = await collection.insertOne({
                                $vector: vector,
                                data: row,
                            });
                            console.log(`Inserted Excel row with ID: ${res.insertedId}`);
                        }
                    }
                } else {
                    // For non-Excel content, handle as plain text
                    const content = await scrapePage(url);
                    if (content) {
                        const chunks = await splitter.splitText(content);
                        for (const chunk of chunks) {
                            const embedding = await openai.embeddings.create({
                                model: "text-embedding-ada-002",
                                input: chunk,
                                encoding_format: "float",
                            });

                            const vector = embedding.data[0].embedding;
                            const res = await collection.insertOne({
                                $vector: vector,
                                text: chunk,
                            });
                            console.log(`Inserted chunk with ID: ${res.insertedId}`);
                        }
                    } else {
                        console.log(`No content found for URL: ${url}`);
                    }
                }
            } else {
                console.log(`Failed to download file from URL: ${url}`);
            }
        } catch (error) {
            console.error(`Error processing URL ${url}:`, error.message);
        }
    }
};

const processFile = async (filePath: string) => {
  const ext = path.extname(filePath).toLowerCase(); // Get the file extension

  switch (ext) {
    case ".pdf":
      const pdfContent = await processPDF(filePath);
      console.log("PDF Content:", pdfContent);
      break;
    case ".xlsx":
      // Process Excel files using XLSX
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(sheet);
      console.log("Excel Data:", data);
      break;
    default:
      console.log("Unsupported file type:", ext);
  }
};

// Example
processFile("./downloads/sample.pdf");
processFile("./downloads/sample.xlsx");



// const loadSampleData = async () => {
//     try {
//         const collection = db.collection(ASTRA_DB_COLLECTION);

//         for await (const url of aiCoachData) {
//             const content = await scrapePage(url);

//             if (!content) {
//                 console.log(`No content found for URL: ${url}`);
//                 continue; // Skip processing if content is null
//             }

//             const chunks = await splitter.splitText(content);

//             for await (const chunk of chunks) {
//                 try {
//                     const embedding = await openai.embeddings.create({
//                         model: "text-embedding-3-small",
//                         input: chunk,
//                         encoding_format: "float",
//                     });

//                     const vector = embedding.data[0]?.embedding;
//                     if (!vector) {
//                         console.error(`Embedding generation failed for chunk: ${chunk}`);
//                         continue;
//                     }

//                     const res = await collection.insertOne({
//                         $vector: vector,
//                         text: chunk,
//                     });
//                     console.log(`Inserted chunk with ID: ${res.insertedId}`);
//                 } catch (chunkError) {
//                     console.error(`Error processing chunk: ${chunk}, Error: ${chunkError.message}`);
//                 }
//             }
//         }
//     } catch (error) {
//         console.error(`Error in loadSampleData: ${error.message}`);
//     }
// };





// const loadSampleData = async() => {
//     const collection = db.collection(ASTRA_DB_COLLECTION)
//     for await(const url of aiCoachData){
//         const content = await scrapePage(url)
//         const chunks = await splitter.splitText(content)
//         for await (const chunk of chunks) {
//             const embedding = await openai.embeddings.create({
//                 model: "text-embedding-3-small",
//                 input: "utf",
//                 encoding_format:"float"
//             })

//             const vector = embedding.data[0].embedding

//             const res = await collection.insertOne({
//                 $vector: vector,
//                 text: chunk
//             })
//             console.log(res);
            
//         }
//     }
// }

const scrapePage = async (url: string): Promise<string | null> => {
    try {
        // Check if the URL is for a downloadable file
        if (url.endsWith(".xlsx")) {
            console.log(`Downloading file from URL: ${url}`);
            const response = await axios.get(url, { responseType: "arraybuffer" });

            // Save the file locally
            const fileName = path.basename(url);
            const filePath = path.resolve(__dirname, "downloads", fileName);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, response.data);

            console.log(`File downloaded and saved to: ${filePath}`);
            return null; // No content to return for processing
        }

        // If not a file URL, use Puppeteer to scrape the page
        const loader = new PuppeteerWebBaseLoader(url, {
            launchOptions: { headless: true },
            gotoOptions: { waitUntil: "domcontentloaded" },
        });

        const scrapedContent = await loader.scrape();
        if (!scrapedContent) {
            throw new Error(`No content scraped from ${url}`);
        }
        return scrapedContent.replace(/<[^>]*>?/gm, ""); // Remove HTML tags
    } catch (error) {
        console.error(`Error scraping page at ${url}: ${error.message}`);
        return null; // Return null for failed scraping
    }
};

createCollection().then(() => loadSampleData())
// Second 22222222222222
// const scrapePage = async (url: string): Promise<string | null> => {
//   try {
//     const loader = new PuppeteerWebBaseLoader(url, {
//       launchOptions: {
//         headless: true, // Launch Puppeteer in headless mode
//       },
//       gotoOptions: {
//         waitUntil: "domcontentloaded", // Wait until the DOM content is fully loaded
//       },
//       evaluate: async (page) => {
//         // Evaluate and extract the page content
//         const result = await page.evaluate(() => document.body.innerHTML);
//         return result;
//       },
//     });

//     // Perform scraping
//     const result = await loader.scrape();
//     return result?.replace(/<[^>]*>?/gm, '') || null; // Return null if the result is undefined

//     // Remove HTML tags using regex and return cleaned content
//     // return result? scrapedContent.replace(/<[^>]*>?/gm, "") : null;
//   } catch (error) {
//     console.error(`Error scraping page: ${error.message}`);
//         return null; // Return null if scraping fails
//   }
// };

//// first 111111111111111

// const scrapePage = async(url:string) => {
//     const loader = new PuppeteerWebBaseLoader(url, {
//         launchOptions: {
//             headless: true
//         },
//         gotoOptions: {
//             waitUntil: "domcontentloaded",
//         },
//         evaluate: async(page, browser) => {
//             const result = await page.evaluate(() => document.body.innerHTML)
//             await browser.close()
//             return result;
//         }
//     })
//     return (await loader.scrape())?.replace(/<[^>]*>?/gm,'')
// }

// createCollection().then(() => loadSampleData())