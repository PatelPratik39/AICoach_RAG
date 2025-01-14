import { DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from "@langchain/community/document_loaders/web/puppeteer";
import axios from "axios";
import * as XLSX from "xlsx";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
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

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
// "https://nces.ed.gov/pubs92/92022.pdf",
//   "https://www.isbe.net/ilreportcarddata",
const aiCoachData = [
  "https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/24-RC-Pub-Data-Set.xlsx",
  "https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/IL-Student-Growth-2024-CohortvsBaseline.xlsx",
];

// Process PDF
const processPDF = async (filePath: string): Promise<string> => {
  const pdfBuffer = fs.readFileSync(filePath); // Read PDF as buffer
  const pdfData = await pdfParse(pdfBuffer); // Extract text
  return pdfData.text; // Return text content
};

// Process Excel
const processExcelFile = (filePath: string): any[] => {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet);
};

// Initialize Astra DB Client
const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

// Initialize Text Splitter
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

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

// Scrape Page or Download File
const scrapePage = async (url: string): Promise<string | null> => {
  try {
    if (url.endsWith(".xlsx")) {
      console.log(`Downloading Excel file from URL: ${url}`);
      const response = await axios.get(url, { responseType: "arraybuffer" });
      const fileName = path.basename(url);
      const filePath = path.resolve(__dirname, "downloads", fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, response.data);
      return null;
    } else if (url.endsWith(".pdf")) {
      console.log(`Downloading PDF file from URL: ${url}`);
      const response = await axios.get(url, { responseType: "arraybuffer" });
      const fileName = path.basename(url);
      const filePath = path.resolve(__dirname, "downloads", fileName);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, response.data);
      return processPDF(filePath);
    }

    const loader = new PuppeteerWebBaseLoader(url, {
      launchOptions: { headless: true },
      gotoOptions: { waitUntil: "domcontentloaded" },
    });

    const content = await loader.scrape();
    return content?.replace(/<[^>]*>?/gm, "") || null;
  } catch (error) {
    console.error(`Error processing URL ${url}: ${error.message}`);
    return null;
  }
};

const loadSampleData = async () => {
  const collection = db.collection(ASTRA_DB_COLLECTION);

  const urls = [
    "https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/24-RC-Pub-Data-Set.xlsx",
    "https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/IL-Student-Growth-2024-CohortvsBaseline.xlsx",
  ];

  for (const url of urls) {
    console.log(`Processing URL: ${url}`);
    const filePath = await downloadFile(url);

    if (!filePath) {
      console.log(`Failed to download file from URL: ${url}`);
      continue;
    }

    const fileExtension = path.extname(filePath);

    if (fileExtension === ".xlsx" || fileExtension === ".xls") {
      // Call processExcelFile() here to parse the Excel file
      const data = processExcelFile(filePath);
      if (data.length > 0) {
        console.log(`Storing data from file: ${filePath}`);
        await storeDataInVectorDB(data, collection); // Store parsed Excel data in the vector DB
      } else {
        console.log(`No valid data found in file: ${filePath}`);
      }
    } else {
      console.log(`Unsupported file type for URL: ${url}`);
    }
  }
};


// Execute
createCollection().then(() => loadSampleData());
