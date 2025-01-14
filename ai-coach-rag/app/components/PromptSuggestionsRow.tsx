import PromptSuggestionButton from "./PromptSuggestionButton";

const PromptSuggestionsRow = ({ onPromptClick }) => {

    const prompts = [
        "What were the poverty rates for children under 18 by racial and ethnic groups in 2022?",
        "How does family socioeconomic status impact educational outcomes according to the report?",
        "How do median earnings differ between individuals with bachelor’s, associate’s, and master’s degrees?",
        "What was the employment rate for 25- to 34-year-olds based on educational attainment in 2022?"

    ]
    return (
        <>
            <div className="prompt-suggestion-row">
                {prompts.map((prompt, index) =>
                    <PromptSuggestionButton key={`suggestion-${index}`}
                        text={prompt}
                        onClick={() => onPromptClick(prompt)} />)}
            </div>
        </>
    )

}
export default PromptSuggestionsRow;