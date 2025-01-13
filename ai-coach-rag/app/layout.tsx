
import { Children } from "react"
import "./global.css"

export const metadata = {
    title: "AICOACHGPT",
    description: "what are this data about?"
}

const RootLayout = ({children}) => {
    return(
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}

export default RootLayout;