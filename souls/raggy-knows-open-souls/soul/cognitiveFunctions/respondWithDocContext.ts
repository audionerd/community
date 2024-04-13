import { indentNicely, useActions, useBlueprintStore } from "@opensouls/engine"
import instruction from "../cognitiveSteps/instruction.js"
import externalDialog from "../lib/externalDialog.js"

// const EXTRACTION_MODEL="exp/mixtral-8x22b-instruct"
const EXTRACTION_MODEL="exp/claude-3-haiku"

export const respondWithDocContext = async ({ workingMemory }) => {
  const { search } = useBlueprintStore("docs")
  const { log } = useActions()

  const [, summary] = await instruction(
    workingMemory,
    indentNicely`
      Describe, in detail, what information ${workingMemory.soulName} needs to answer the most recent questions from the interlocutor.
      Provide a concise paragraph here outlining the key information that needs to be extracted from the text. Be as specific as possible about what details, facts, instructions, or examples should be identified and pulled out.
    `,
    {
      model: "quality"
    }
  )

  log("searching for", summary)

  const results = await search(summary)

  const onlyPersonality = workingMemory.slice(0, 1)

  const relevantInfo = await Promise.all(results.map(async (result) => {
    const prompt = indentNicely`
      Your task is to analyze the provided text and extract information relevant to the given summary of needed information. Carefully read through the text, identify the portions that match the information requested in the summary, and extract those specific sections. If the text contains any code samples, mathematical equations, tables, or special formatting, ensure that you preserve them fully intact and unchanged in your output. Do not paraphrase or alter the original text.

      Summary of Needed Information:
      ${summary}

      Text to Analyze:
      ${result.content}

      Please respond with only snippets fro the Text To Analyze, not any analysis or attempts to answer questions.
    `
    const [, info] = await instruction(onlyPersonality, prompt, {
      model: EXTRACTION_MODEL
    })

    log("extracted", info)
    return info
  }))

  return instruction(
    workingMemory,
    indentNicely`
      * Carefully review the chat history to understand the context and the user's queries or requests.
      * Analyze the relevant context provided by the RAG system to gather additional information that may help you respond more accurately and comprehensively.
      * Combine the information from the chat history and the relevant context to formulate a clear, concise, and appropriate response to the user's latest message.
      * If the user's request is unclear or ambiguous, ask for clarification before providing a response.
      * If the relevant context does not contain enough information to answer the user's question satisfactorily, acknowledge the limitations and suggest alternative resources or ways to find the information.
      
      ## Relevant Context
      ${relevantInfo.join("\n\n")}

      ## Instructions
      Please respond with ${workingMemory.soulName}'s answer to the user's latest query, incorporating the extracted information from the relevant context. Speak in ${workingMemory.soulName}'s voice and provide a detailed, accurate, and helpful response to the user's question or request.

      DO NOT use any words like '${workingMemory.soulName} said' or 'I think' in your response. Simply present the information as ${workingMemory.soulName}'s direct answer to the user's query. Respond in ${workingMemory.soulName}'s voice and style, focusing on clarity, accuracy, and relevance.
    `,
    {
      model: "quality",
      stream: true,
    }
  )
}