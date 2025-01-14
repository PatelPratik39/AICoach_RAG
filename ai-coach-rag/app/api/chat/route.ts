import { Readable } from "stream";
import OpenAI from "Openai";
import { DataAPIClient } from "@datastax/astra-db-ts";

const {
  ASTRA_DB_NAMESPACE,
  ASTRA_DB_COLLECTION,
  ASTRA_DB_API_ENDPOINT,
  ASTRA_DB_APPLICATION_TOKEN,
  OPENAI_API_KEY,
} = process.env;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN);
const db = client.db(ASTRA_DB_API_ENDPOINT, { namespace: ASTRA_DB_NAMESPACE });

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();
    const latestMessage = messages[messages?.length - 1]?.content;

    let docContext = "";

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: latestMessage,
    });

    const embedding = embeddingResponse.data[0].embedding;

    try {
      const collection = db.collection(ASTRA_DB_COLLECTION);
      const response = collection.find(null, {
        sort: {
          $vector: embedding,
        },
        limit: 10,
      });

      const documents = await response.toArray();
      const docsMap = documents?.map((doc) => doc.text);

      docContext = JSON.stringify(docsMap);
    } catch (error) {
      console.log("Error Querying DB:", error.message);
      docContext = "";
    }

    const systemPrompt = {
      role: "system",
      content: `
        You are an AI Assistant who knows everything about education through data.
        Use the below context to augment your knowledge about educational data.
        The document will provide you with the most recent page data from various files, state educational data.
        If the context doesn't include the information you need, answer based on your existing knowledge.
        Do not mention the source of the context or what the context does or doesn't include.
        Format responses using markdown where applicable and avoid returning images.
        --------------
        START CONTEXT
        ${docContext}
        END CONTEXT
        --------------
        Question: ${latestMessage}
        ---------------------------
      `,
    };

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      stream: true,
      messages: [systemPrompt, ...messages],
    });

    // Convert the Node.js Readable to a Web ReadableStream
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of completion) {
            const content = chunk.choices[0]?.delta?.content || "";
            controller.enqueue(new TextEncoder().encode(content));
          }
          controller.close();
        } catch (err) {
          console.error("Streaming Error:", err.message);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
      },
    });
  } catch (error) {
    console.error("Error:", error.message);
    return new Response(JSON.stringify({ error: "An error occurred." }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}



// // import { OpenAIApi, Configuration } from "Openai";
// import { OpenAIStream, StreamingTextResponse } from "ai";
// import { DataAPIClient } from "@datastax/astra-db-ts";
// import OpenAI from "Openai"


// const {
//   ASTRA_DB_NAMESPACE,
//   ASTRA_DB_COLLECTION,
//   ASTRA_DB_API_ENDPOINT,
//   ASTRA_DB_APPLICATION_TOKEN,
//   OPENAI_API_KEY,
// } = process.env;

// const openai = new OpenAI({
//     apiKey:OPENAI_API_KEY
// })

// const client = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
// const db = client.db(ASTRA_DB_API_ENDPOINT, {namespace:ASTRA_DB_NAMESPACE})

// export async function  POST(req: Request){
//     try{
//         const {messages } = await req.json()
//         const latestMessage = messages[messages?.length - 1]?.content

//         let docContext = ""

//         const embedding = await openai.embeddings.create({
//             model :"text-embedding-3-small",
//             input: latestMessage,
//             encoding_format:"float"
//         })

//         try {
//             const collection = db.collection(ASTRA_DB_COLLECTION)
//             const response = collection.find(null,{
//                 sort: {
//                     $vector: embedding.data[0].embedding,
//                 },
//                 limit:10
//             })
//             const documents = await response.toArray()

//             const docsMap = documents?.map(doc => doc.text)

//             docContext = JSON.stringify(docsMap)
//         } catch(error){
//             console.log("Error Querying db....");
//             docContext=""
//         }
//         const template = {
//             role: "system",
//             content:`
//             You are an AI Assistant who knows everything about Education through data.
//             Use the below context to augment what you know about Educational data.
//             the document will provide you with the most recent page data from various files, State Eduational Data.
//             If the context doesn't include the information you need answer based on your existing knowledge and don't mention the source of information or what the context does or doesn't include.
//             Format responses using markdown where appliable and don't return images.
//             --------------
//             START CONTEXT
//             ${docContext}
//             END CONTENT
//             --------------
//             Question: ${latestMessage}
//             ---------------------------

//             `
//         }

//         const resposne = await openai.chat.completions.create({
//             model: "gpt-4",
//             stream:true,
//             messages:[template, ...messages]
//         })
//         const stream = OpenAIStream(resposne)
//         return new StreamingTextResponse(stream)
//     } catch(error){
//         throw error
//     }
// }
