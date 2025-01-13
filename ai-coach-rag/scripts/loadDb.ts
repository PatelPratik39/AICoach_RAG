import {DataAPIClient} from "@datastax/astra-db-ts";
// import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web";
// import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web/puppeteer";
import OpenAI from "Openai";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";

import "dotenv/config"

const {ASTRA_DB_NAMESPACE,ASTRA_DB_COLLECTION,ASTRA_DB_API_ENDPOINT,ASTRA_DB_APPLICATION_TOKEN,OPENAI_API_KEY} = process.env

const openai = new OpenAI({apiKey: OPENAI_API_KEY})

const aiCoachData = [
    "https://www.isbe.net/ilreportcarddata",
    'https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/24-RC-Pub-Data-Set.xlsx',
    'https://www.isbe.net/_layouts/Download.aspx?SourceUrl=/Documents/IL-Student-Growth-2024-CohortvsBaseline.xlsx'
]

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE})

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 100
})