"use client"
import Image from "next/image"
import logo from "./assets/innovare.png"
import { useChat } from "ai/react";
import { Message } from "ai";
import Bubble from "./components/Bubble";
import PromptSuggestionsRow from "./components/PromptSuggestionsRow";
import LoadingBubble from "./components/LoadingBubble";

const Home = () => {

    const { isLoading, append, messages, input, handleInputChange, handleSubmit } = useChat()
    const noMessages = !messages || messages.length === 0;

    const handlePrompt = (promptText: any) => {
        const msg: Message = {
            id: crypto.randomUUID(),
            content: promptText,
            role: "user"
        }
        append(msg);
    }

    return (
        <main >
            <Image src={logo} width={250} alt="logo" />
            <section className={noMessages ? "" : "populated"} >
                {noMessages ? (
                    <>
                        <p className="starter-text">
                            Innovare empowers education and NGO leaders with Inno™, an all-in-one app that combines data aggregation, strategy development, and project management into a personalized dashboard. Supported by expert guidance, Inno™ helps leaders measure impact in real time and drive continuous improvement. Through the Innoverse™ community, leaders connect, share best practices, and collaborate for collective impact.
                        </p>
                        <br />
                        <PromptSuggestionsRow onPromptClick={handlePrompt} />
                    </>
                ) : (
                    <>
                        {messages.map((message, index) => <Bubble key={`message-${index}`} message={message} />)}
                        {isLoading && <LoadingBubble />}
                    </>
                )}
            </section>
            <form onSubmit={handleSubmit}>
                <input className="question-box" onChange={handleInputChange} value={input} placeholder="Ask something you want" />
                <input type="submit" />

            </form>
        </main>
    )
}

export default Home;