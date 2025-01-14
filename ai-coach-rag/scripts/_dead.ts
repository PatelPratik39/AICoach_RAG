import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import axios from "axios";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import pdfParse from "pdf-parse";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { encoding_for_model } from "tiktoken";

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
// const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  timeout: 600000
});

const tokenizer = encoding_for_model("text-embedding-ada-002");

const aiCoachData = [
    "./downloads/excel.xlsx",

];


// const aiCoachData = [
    
//   "https://nces.ed.gov/pubs2024/2024144.pdf",
//   "https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/24-RC-Pub-Data-Set.xlsx",
//   "https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/IL-Student-Growth-2024-CohortvsBaseline.xlsx",
// ];

// Process PDF
const processPDF = async (filePath: string): Promise<string> => {
  const pdfBuffer = fs.readFileSync(filePath);
  const pdfData = await pdfParse(pdfBuffer);
  return pdfData.text;
};

// Process Excel
const processExcelFile = (filePath: string): { sheetName: string; data: any[] }[] => {
  const workbook = XLSX.readFile(filePath);
  return workbook.SheetNames.map(sheetName => ({
    sheetName,
    data: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]),
  }));
};

// Download File
// const downloadFile = async (url: string): Promise<string | null> => {
//   try {
//     console.log(`Downloading file from URL: ${url}`);
//     const response = await axios.get(url, { responseType: "arraybuffer" });
//     const fileName = path.basename(url);
//     const filePath = path.resolve(__dirname, "downloads", fileName);
//     fs.mkdirSync(path.dirname(filePath), { recursive: true });
//     fs.writeFileSync(filePath, response.data);
//     return filePath;
//   } catch (error) {
//     console.error(`Failed to download file from URL ${url}: ${error.message}`);
//     return null;
//   }
// };

// Count Tokens
const countTokens = (text: string): number => tokenizer.encode(text).length;

// Store Data in Vector DB
const storeDataInVectorDB = async (data: any[], collection: any) => {
  const batchSize = 10;
  let batch: any[] = [];

  for (const item of data) {
    try {
      const itemString = JSON.stringify(item);
      if (countTokens(itemString) > 8192) {
        console.warn("Item exceeds token limit, skipping:", itemString.substring(0, 100));
        continue;
      }

      const embedding = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: itemString,
        encoding_format: "float",
      });

      const vector = embedding.data[0].embedding;
      batch.push({ $vector: vector, ...item });

      if (batch.length === batchSize) {
        await collection.insertMany(batch);
        console.log(`Inserted batch of ${batch.length} records.`);
        batch = [];
      }
    } catch (error) {
      console.error(`Failed to store data in vector DB: ${error.message}`);
    }
  }

  if (batch.length > 0) {
    await collection.insertMany(batch);
    console.log(`Inserted remaining batch of ${batch.length} records.`);
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
const sanitizeFieldNames = (data: any[]): any[] =>
  data.map(row => {
    const sanitizedRow: any = {};
    for (const key in row) {
      const sanitizedKey = key.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/__+/g, "_").replace(/^_|_$/g, "");
      sanitizedRow[sanitizedKey] = row[key];
    }
    return sanitizedRow;
  });

  //load Data
const loadSampleData = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION);

  for (const filePath of aiCoachData) {
    console.log(`Processing file: ${filePath}`);
    const fileExtension = path.extname(filePath);

    if (fileExtension === ".xlsx" || fileExtension === ".xls") {
      const sheets = processExcelFile(filePath);
      for (const { sheetName, data } of sheets) {
        console.log(`Processing sheet: ${sheetName}`);
        const sanitizedData = sanitizeFieldNames(data);
        const limitedData = sanitizedData.slice(0, 5000); // Process in smaller chunks
        for (let i = 0; i < limitedData.length; i += 100) {
          const chunk = limitedData.slice(i, i + 100);
          await storeDataInVectorDB(chunk, collection);
        }
      }
    } else if (fileExtension === ".pdf") {
      const content = await processPDF(filePath);
      const chunks =  (await splitter.splitText(content)).filter(chunk => countTokens(chunk) <= 8192);
      for (let i = 0; i < chunks.length; i += 100) {
        const chunkBatch = chunks.slice(i, i + 100);
        await storeDataInVectorDB(chunkBatch, collection);
      }
    } else {
      console.log(`Unsupported file type: ${fileExtension}`);
    }
  }
};



// Initialize Astra DB Client
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

// Create Collection
const createCollection = async (similarityMetric: SimiliarityMetric = "dot_product") => {
  try {
    await db.createCollection(ASTRA_DB_COLLECTION, {
      vector: { dimension: 1536, metric: similarityMetric },
    });
    console.log(`Collection '${ASTRA_DB_COLLECTION}' created successfully.`);
  } catch (error: any) {
    if (error.name === "CollectionAlreadyExistsError") {
      console.log(`Collection '${ASTRA_DB_COLLECTION}' already exists.`);
    } else {
      throw error;
    }
  }
};

// Execute
createCollection().then(loadSampleData);
