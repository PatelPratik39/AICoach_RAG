
import OpenAI from "openai"
// import { OpenAIStream, streamText } from "ai";
// import OpenAIStream from "ai";
// import StreamingTextResponse from "ai";
import { DataAPIClient } from "@datastax/astra-db-ts";
// import { streamText } from "ai";
import { OpenAIStream, StreamingTextResponse } from "ai";


const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  OPENAI_API_KEY,
} = process.env;

const openai = new OpenAI({
    apiKey:OPENAI_API_KEY
})

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = client.db(ASTRA_DB_API_ENDPOINT, {namespace:ASTRA_DB_NAMESPACE})

export async function  POST(req: Request){
    try{
        const {messages } = await req.json()
        const latestMessage = messages[messages?.length - 1]?.content

        let docContext = ""

        const embedding = await openai.embeddings.create({
            model :"text-embedding-3-small",
            input: latestMessage,
            encoding_format:"float"
        })

        try {
            const collection = db.collection(ASTRA_DB_COLLECTION)
            const response = collection.find(null,{
                sort: {
                    $vector: embedding.data[0].embedding,
                },
                limit:10
            })
            const documents = await response.toArray()

            const docsMap = documents?.map(doc => doc.text)

            docContext = JSON.stringify(docsMap)
        } catch(error){
            console.log("Error Querying db....");
            docContext=""
        }
        const template = {
            role: "system",
            content:`
            You are an AI Assistant who knows everything about Education through data.
            Use the below context to augment what you know about Educational data.
            the document will provide you with the most recent page data from various files, State Eduational Data.
            If the context doesn't include the information you need answer based on your existing knowledge and don't mention the source of information or what the context does or doesn't include.
            Format responses using markdown where appliable and don't return images.
            --------------
            START CONTEXT
            ${docContext}
            END CONTENT
            --------------
            Question: ${latestMessage}
            ---------------------------

            `
        }

        const resposne = await openai.chat.completions.create({
            model: "gpt-4",
            stream:true,
            messages:[template, ...messages]
        })
        const stream = OpenAIStream(resposne)
        return new StreamingTextResponse(stream)
    } catch(error){
        throw error
    }
}
