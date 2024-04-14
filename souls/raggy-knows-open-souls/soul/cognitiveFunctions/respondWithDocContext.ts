import { ChatMessageRoleEnum, indentNicely, useActions, useBlueprintStore } from "@opensouls/engine"
import instruction from "../cognitiveSteps/instruction.js"
import internalMonologue from "../cognitiveSteps/internalMonologue.js"
import externalDialog from "../lib/externalDialog.js"

// const EXTRACTION_MODEL="exp/mixtral-8x22b-instruct"
// const EXTRACTION_MODEL="exp/claude-3-haiku"
const EXTRACTION_MODEL="exp/nous-hermes-2-mixtral-fp8"

export const respondWithDocContext = async ({ workingMemory }) => {
  const { search } = useBlueprintStore("docs")
  const { log } = useActions()

  const [withWhatQuestion, query] = await internalMonologue(
    workingMemory,
    `${workingMemory.soulName} decided to answer a recent query from the interlocutor, what was the query?`,
    {
      model: "gpt-4-turbo"
    }
  )

  log("query", query)

  const [, summary] = await instruction(
    withWhatQuestion,
    indentNicely`
      Describe, in detail, what information ${workingMemory.soulName} needs to answer the most recent questions from the interlocutor.
      Provide a concise 1-3 sentences outlining the key information that ${workingMemory.soulName} needs. Be as specific as possible about what details, facts, instructions, or examples to identify and extract.
    `,
    {
      model: "quality"
    }
  )

  log("searching for", summary)

  const results = await search(summary)
  log("found", results.length, "results", results.map((r) => r.key))

  // const onlyPersonality = workingMemory.slice(0, 1)

  const relevantInfo = await Promise.all(results.map(async (result) => {
    log("analyzing ", result.key)
    const prompt = indentNicely`
      ## User's Query: 
      ${query}

      ## Summary of Needed Information:
      ${summary}

      ## Text to Analyze:
      ${result.content}

      Please respond with only snippets (extractions) from the Text To Analyze, not any analysis or attempts to answer questions. If the text has no relevance to the Summary of Needed Information, respond with only the characters "NONE".
    `
    const [, info] = await instruction(
      workingMemory.replace([{
        role: ChatMessageRoleEnum.System,
        content: indentNicely`
          Your task is to analyze the provided text and extract sections that are relevant to the Summary of Needed Information. Carefully read through the text, identify the portions that match the information requested in the summary, and extract those specific sections. Do not paraphrase or alter the original text.
        `
      }]),
      prompt, 
      {
      model: EXTRACTION_MODEL
      }
    )

    log("extracted", info)
    if (info.includes("NONE")) {
      return ""
    }

    return info
  }))

  const [withThoughts, howto] = await internalMonologue(
    withWhatQuestion,
    indentNicely`
      ## Relevant Context
      ${relevantInfo.join("\n\n")}

      Given the query (${query}) and the extracted information, what are the steps ${workingMemory.soulName} should take to respond to the user's question or request?
    `,
    {
      model: "gpt-4-turbo"
    }
  )

  log("howto: ", howto)

  return instruction(
    withThoughts,
    indentNicely`
      * Carefully review the chat history to understand the context and the user's recent query or request.
      * Analyze the Relevant Context provided to help you respond more accurately and comprehensively.
      * Combine the information from the chat history and the relevant context to formulate a clear, concise, and appropriate response to the user's latest query.
      * If the user's request is unclear or ambiguous, ask for clarification before providing a response.
      * If the Relevant Context does not contain enough information to answer the user's question satisfactorily, acknowledge the limitations and suggest alternative resources or ways to find the information.
      
      ## Relevant Context
      ${relevantInfo.join("\n\n")}

      ## Instructions
      Please respond with ${workingMemory.soulName}'s answer to the latest query, incorporating the extracted information from the relevant context. Speak in ${workingMemory.soulName}'s voice and provide a detailed, accurate, and helpful response to the user's question or request.

      IMPORTANT! Make sure to only use samples from the docs to construct code, do not interpret the results or provide your own code. However, if there is a relevant example, show it and link to the docs.

      DO NOT use any words like '${workingMemory.soulName} said' or 'I think' in your response. Simply present the information as ${workingMemory.soulName}'s direct answer to the user's query. Respond in ${workingMemory.soulName}'s voice and style, focusing on clarity, accuracy, and relevance.
    `,
    {
      model: "gpt-4-turbo",
      stream: true,
    }
  )
}