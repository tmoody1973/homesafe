import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { requireEnv } from "../config/env";

export const EMBEDDING_MODEL_ID = "amazon.titan-embed-text-v2:0";

// Measured on 2026-08-14 by calling the model, not read from a doc. The
// memory_item.embedding column is VECTOR(1024) to match.
export const EMBEDDING_WIDTH = 1024;

let client: BedrockRuntimeClient | undefined;

function bedrockClient(): BedrockRuntimeClient {
  client ??= new BedrockRuntimeClient({
    region: requireEnv(process.env, "AWS_REGION"),
  });
  return client;
}

function parseVector(payload: Uint8Array): number[] {
  const body = JSON.parse(new TextDecoder().decode(payload)) as {
    embedding?: number[];
  };
  const vector = body.embedding;
  if (!Array.isArray(vector)) {
    throw new Error("Titan response contained no embedding array");
  }
  // A model that quietly changes width would corrupt every stored memory and
  // surface as a VECTOR(1024) write rejection far from the cause.
  if (vector.length !== EMBEDDING_WIDTH) {
    throw new Error(
      `Expected ${EMBEDDING_WIDTH} dimensions from ${EMBEDDING_MODEL_ID}, got ${vector.length}`,
    );
  }
  return vector;
}

export async function embed(text: string): Promise<number[]> {
  if (text.trim() === "") {
    throw new Error("Cannot embed empty text");
  }
  const response = await bedrockClient().send(
    new InvokeModelCommand({
      modelId: EMBEDDING_MODEL_ID,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        inputText: text,
        dimensions: EMBEDDING_WIDTH,
      }),
    }),
  );
  return parseVector(response.body);
}
