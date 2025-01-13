import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import axios from "axios";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "Openai";
import pdfParse from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

import "dotenv/config";

// Type Definitions
type SimiliarityMetric = "dot_product" | "cosine" | "euclidean";

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  OPENAI_API_KEY,
} = process.env;

// Initialize Text Splitter
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const aiCoachData = [
  "https://nces.ed.gov/pubs2024/2024144.pdf",
  "https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/24-RC-Pub-Data-Set.xlsx",
  "https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/IL-Student-Growth-2024-CohortvsBaseline.xlsx",
];

// Process PDF
const processPDF = async (filePath: string): Promise<string> => {
  const pdfBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(pdfBuffer);
  return pdfData.text;
};

// Process Excel
const processExcelFile = (filePath: string): { sheetName: string; data: any[] }[] => {
  const workbook = XLSX.readFile(filePath); // Read the Excel file
  const result = []; // Array to store data from all sheets

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]; // Get the sheet by name
    const data = XLSX.utils.sheet_to_json(sheet); // Convert sheet to JSON
    result.push({ sheetName, data }); // Add the sheet's data to the result
  }

  return result; // Return all sheets with their data
};


// Download File
const downloadFile = async (url: string): Promise<string | null> => {
  try {
    console.log(`Downloading file from URL: ${url}`);
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const fileName = path.basename(url);
    const filePath = path.resolve(__dirname, "downloads", fileName);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, response.data);
    return filePath;
  } catch (error) {
    console.error(`Failed to download file from URL ${url}: ${error.message}`);
    return null;
  }
};

const storeDataInVectorDB = async (data: any[], collection: any) => {
  const batchSize = 50;
  let batch = [];
  for (const item of data) {
    try {
      // Generate embeddings using OpenAI
      const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002", // Model for embedding
        input: JSON.stringify(item), // Convert the data row to a string
        encoding_format: "float",
      });

      // Extract the embedding vector
      const vector = embedding.data[0].embedding;

      // Prepare the batch
      batch.push({
        $vector: vector,
        ...item,
      });
      // If the batch is full, insert into the database
      if (batch.length === batchSize) {
        const res = await collection.insertMany(batch);
        console.log(`Inserted batch of ${batch.length} records.`);
        batch = []; // Reset the batch
      }

      // Insert the vector and data into the database
      // const res = await collection.insertOne({
      //   $vector: vector,
      //   ...item, // Spread sanitized data fields
      // });

      // console.log(`Inserted data with ID: ${res.insertedId}`);
    } catch (error) {
      console.error(`Failed to store data in vector DB: ${error.message}`);
    }
  }
};

// Scrape Page
const scrapePage = async (url: string): Promise<string | null> => {
  try {
    console.log(`Scraping content from URL: ${url}`);
    const loader = new PuppeteerWebBaseLoader(url, {
      launchOptions: { headless: true },
      gotoOptions: { waitUntil: "domcontentloaded" },
    });

    const content = await loader.scrape();
    return content?.replace(/<[^>]*>?/gm, "") || null;
  } catch (error) {
    console.error(`Error scraping page at ${url}: ${error.message}`);
    return null;
  }
};

// Utility to sanitize field names
const sanitizeFieldNames = (data: any[]): any[] => {
  return data.map((row) => {
    const sanitizedRow: any = {};
    for (const key in row) {
      const sanitizedKey = key
        .replace(/[^a-zA-Z0-9_-]/g, "_") // Replace invalid characters with underscores
        .replace(/__+/g, "_") // Replace multiple underscores with a single underscore
        .replace(/^_|_$/g, ""); // Remove leading or trailing underscores
      sanitizedRow[sanitizedKey] = row[key];
    }
    return sanitizedRow;
  });
};

// Updated loadSampleData
const loadSampleData = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION);

  for (const url of aiCoachData) {
    console.log(`Processing URL: ${url}`);
    const fileExtension = path.extname(url);
    ;

    if (fileExtension === ".xlsx" || fileExtension === ".xls" || fileExtension === ".pdf") {
      const filePath = await downloadFile(url);

      if (!filePath) {
        console.log(`Failed to download file from URL: ${url}`);
        continue;
      }

      if (fileExtension === ".xlsx" || fileExtension === ".xls") {
        const data = processExcelFile(filePath);
        if (data.length > 0) {
          console.log(`Sanitizing and storing Excel data from file: ${filePath}`);
          const sanitizedData = sanitizeFieldNames(data);
          await storeDataInVectorDB(sanitizedData, collection);
        } else {
          console.log(`No valid data found in Excel file: ${filePath}`);
        }
      } else if (fileExtension === ".pdf") {
        const content = await processPDF(filePath);
        const chunks = await splitter.splitText(content); // `splitter` is accessible here
        if (chunks.length > 0) {
          console.log(`Storing PDF data from file: ${filePath}`);
          await storeDataInVectorDB(chunks, collection);
        } else {
          console.log(`No valid content found in PDF file: ${filePath}`);
        }
      }
    } else {
      const content = await scrapePage(url);
      if (content) {
        const chunks = await splitter.splitText(content);
        if (chunks.length > 0) {
          console.log(`Storing scraped data from URL: ${url}`);
          await storeDataInVectorDB(chunks, collection);
        } else {
          console.log(`No valid content found at URL: ${url}`);
        }
      }
    }
  }
};



// Initialize Astra DB Client
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

// Create Collection
const createCollection = async (similarityMetric: SimiliarityMetric = "dot_product") => {
  try {
    const res = await db.createCollection(ASTRA_DB_COLLECTION, {
      vector: {
        dimension: 1536,
        metric: similarityMetric,
      },
    });
    console.log(`Collection '${ASTRA_DB_COLLECTION}' created successfully.`);
  } catch (error: any) {
    if (error.name === "CollectionAlreadyExistsError") {
      console.log(`Collection '${ASTRA_DB_COLLECTION}' already exists.`);
    } else {
      console.error(`Error creating collection: ${error.message}`);
      throw error;
    }
  }
};

// Execute
createCollection().then(() => loadSampleData());
