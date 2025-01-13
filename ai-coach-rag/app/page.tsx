"use client"
import Image from "next/image"
import logo from "./assets/innovare.png"
import background from "./assets/background.png"
import { useChat } from "ai/react";
import { Message } from "ai";

const Home = () => {

    const {isLoading, append, messages, input, handleInputChange, handleSubmit} = useChat()
    const noMessages = true;

    return(
        <main >
            <Image src={logo} width={250}  alt="logo" />
            <section className={noMessages ? "": "populated"} >
                    {noMessages? (
                        <>
                        <p className="starter-text">
                            Innovare empowers education and NGO leaders with Inno™, an all-in-one app that combines data aggregation, strategy development, and project management into a personalized dashboard. Supported by expert guidance, Inno™ helps leaders measure impact in real time and drive continuous improvement. Through the Innoverse™ community, leaders connect, share best practices, and collaborate for collective impact.
                        </p>
                        <br/>
                        {/* <PromptSuggestion /> */}
                        </>
                    ): (
                        <>
                        {/* map messages onto text bubbles */}
                        {/* loading bubbles */}
                        </>
                    )}
                    {/* <form onSubmit={handleSubmit}>
                        <input className="question-box" onChange={handleInputChange} value={input} placeholder="Ask something you want"/>
                        <input type="submit"/>

                    </form> */}
            </section>
        </main>
    )
}

export default Home;