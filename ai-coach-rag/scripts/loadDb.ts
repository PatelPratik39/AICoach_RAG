import {DataAPIClient} from "@datastax/astra-db-ts";
// import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web";
// import { PuppeteerWebBaseLoader } from "langchain/document_loaders/web/puppeteer";
import { PuppeteerWebBaseLoader } from "langchain/document_loaders";
import OpenAI from "Openai";
import {RecursiveCharacterTextSplitter} from "langchain/text_splitter";

import "dotenv/config"

type SimiliarityMetric = "dot_product" | "cosine" | "euclidean"

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

const createCollection = async(similarityMetric: SimiliarityMetric = "dot_product") => {
    const res = await db.createCollection(ASTRA_DB_COLLECTION, {
        vector:{
            dimension: 1536,
            metric: similarityMetric
        }
    })
    console.log(res)
}

const loadSampleData = async() => {
    const collection = db.collection(ASTRA_DB_COLLECTION)
    for await(const url of aiCoachData){
        const content = await scrapePage(url)
        const chunks = await splitter.splitText(content)
        for await (const chunk of chunks) {
            const embedding = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: "utf",
                encoding_format:"float"
            })

            const vector = embedding.data[0].embedding

            const res = await collection.insertOne({
                $vector: vector,
                text: chunk
            })
            console.log(res);
            
        }
    }
}